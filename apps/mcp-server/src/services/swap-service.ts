import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, type SwapAsset, type SwapOrder, type SwapQuote } from "@aifinpay/shared";
import { PairAvailabilityCache, curatedAssets } from "./verified-pairs.js";

const API_BASE = "https://api.changenow.io/v2";
const QUOTE_TTL_MS = 4 * 60_000;
const ASSET_CACHE_TTL_MS = 5 * 60_000;
const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const SAFE_ID = /^[A-Za-z0-9_-]{6,160}$/;

// ChangeNOW reports some refusals as {"error":"pair_is_inactive","message":""}.
// An empty string still satisfies a typeof check, so reading `message` alone
// produced an empty error and the widget fell back to "Could not load a live
// quote" — hiding the actual reason from the user. Prefer a usable message,
// then translate the error code, and only then give up.
const PROVIDER_ERRORS: Record<string, string> = {
  pair_is_inactive: "This pair cannot be swapped right now. Choose a different pair.",
  not_valid_params: "The swap provider rejected these parameters.",
  deposit_too_small: "That amount is below the provider's minimum for this pair.",
  out_of_range: "That amount is outside the provider's allowed range for this pair.",
  pair_not_found: "The provider does not offer this pair."
};

export function providerFailureMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "The swap provider rejected this request.";
  const record = body as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message) return message.slice(0, 180);
  const code = typeof record.error === "string" ? record.error.trim() : "";
  if (code) return PROVIDER_ERRORS[code] ?? `The swap provider refused this request (${code.slice(0, 60)}).`;
  return "The swap provider rejected this request.";
}

interface QuotePayload extends SwapQuote {
  userId: string;
  rateId?: string;
}

interface OrderReference {
  userId: string;
  orderId: string;
  expiresAt: string;
}

function asset(value: unknown): SwapAsset | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const ticker = typeof item.ticker === "string" ? item.ticker.toLowerCase() : "";
  const network = typeof item.network === "string" ? item.network.toLowerCase() : "";
  const name = typeof item.name === "string" ? item.name : ticker.toUpperCase();
  if (!/^[a-z0-9-]{1,30}$/.test(ticker) || !/^[a-z0-9-]{1,30}$/.test(network)) return null;
  return { ticker, network, name, ...(typeof item.image === "string" && item.image.startsWith("https://") ? { image: item.image } : {}) };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export class SwapService {
  private readonly availability = new PairAvailabilityCache();
  private assetCache: { expiresAt: number; assets: SwapAsset[] } | null = null;

  constructor(private readonly apiKey: string | undefined, private readonly secret: string) {}

  get enabled(): boolean { return Boolean(this.apiKey); }

  private requireEnabled(): string {
    if (!this.apiKey) throw new AppError("SWAP_UNAVAILABLE", "Swap is not configured yet. Add the ChangeNOW partner API key to enable live quotes and orders.", 503);
    return this.apiKey;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const key = this.requireEnabled();
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-changenow-api-key": key, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(12_000)
    }).catch(() => { throw new AppError("SWAP_UNAVAILABLE", "The swap provider is temporarily unavailable.", 503); });
    const body = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      throw new AppError(
        response.status === 429 ? "RATE_LIMITED" : "SWAP_UNAVAILABLE",
        providerFailureMessage(body),
        response.status === 429 ? 429 : 502
      );
    }
    return body;
  }

  private sign(payload: unknown): string {
    const encoded = encode(payload);
    const signature = createHmac("sha256", this.secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  private verify<T>(token: string): T {
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) throw new AppError("QUOTE_EXPIRED", "This swap quote is invalid or expired.", 410);
    const expected = createHmac("sha256", this.secret).update(encoded).digest();
    const provided = Buffer.from(signature, "base64url");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new AppError("QUOTE_EXPIRED", "This swap quote is invalid or expired.", 410);
    try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T; }
    catch { throw new AppError("QUOTE_EXPIRED", "This swap quote is invalid or expired.", 410); }
  }

  /**
   * The curated default: only assets a live-verified pair actually needs.
   * `showAll` returns the provider's full list, which is explicitly NOT a
   * pair-availability list — most of those pairs cannot be quoted.
   */
  async listCuratedAssets(showAll = false): Promise<{ assets: SwapAsset[]; verified: boolean }> {
    const all = await this.listAssets();
    return showAll ? { assets: all, verified: false } : { assets: curatedAssets(all), verified: true };
  }

  async listAssets(): Promise<SwapAsset[]> {
    if (this.assetCache && this.assetCache.expiresAt > Date.now()) return this.assetCache.assets;
    const body = await this.request("/exchange/currencies?active=true&flow=standard");
    if (!Array.isArray(body)) throw new AppError("SWAP_UNAVAILABLE", "The swap provider returned an invalid asset list.", 502);
    const result = body.map(asset).filter((item): item is SwapAsset => Boolean(item));
    if (!result.length) throw new AppError("SWAP_UNAVAILABLE", "No swap assets are available right now.", 503);
    this.assetCache = { expiresAt: Date.now() + ASSET_CACHE_TTL_MS, assets: result };
    return result;
  }

  /**
   * Never trust an asset object supplied by the model or widget. Resolve the
   * ticker/network pair against the provider's active server-side registry and
   * use the canonical provider metadata for every quote and signed quote token.
   */
  private async activeAsset(requested: SwapAsset): Promise<SwapAsset> {
    const canonical = (await this.listAssets()).find(
      (item) => item.ticker === requested.ticker.toLowerCase() && item.network === requested.network.toLowerCase()
    );
    if (!canonical) throw new AppError("NETWORK_UNSUPPORTED", `${requested.ticker.toUpperCase()} on ${requested.network} is not available for swap.`, 400);
    return canonical;
  }

  async quote(userId: string, fromAsset: SwapAsset, toAsset: SwapAsset, fromAmount: string): Promise<{ quote: SwapQuote; quoteToken: string }> {
    if (fromAmount.length > 80 || !AMOUNT.test(fromAmount) || !/[1-9]/.test(fromAmount)) throw new AppError("INVALID_AMOUNT", "Enter a positive swap amount with up to 18 decimal places.");
    // Resolve sequentially so the first lookup populates the short-lived asset
    // cache and one quote never races two provider currency-list requests.
    const canonicalFrom = await this.activeAsset(fromAsset);
    const canonicalTo = await this.activeAsset(toAsset);
    if (canonicalFrom.ticker === canonicalTo.ticker && canonicalFrom.network === canonicalTo.network) throw new AppError("INVALID_AMOUNT", "Choose two different assets or networks.");
    // useRateId belongs to the fixed-rate flow. Sending it alongside
    // flow=standard&type=direct makes ChangeNOW reject the request outright
    // with "standard flow and direct type is unsupported if useRateId flag is
    // true", so every quote failed for every pair and every amount. A standard
    // flow simply has no rate id; createOrder already treats it as optional.
    const query = new URLSearchParams({
      fromCurrency: canonicalFrom.ticker, toCurrency: canonicalTo.ticker,
      fromNetwork: canonicalFrom.network, toNetwork: canonicalTo.network,
      fromAmount, flow: "standard", type: "direct"
    });
    const known = this.availability.recentlyFailed(canonicalFrom, canonicalTo);
    if (known) {
      // Already refused moments ago. Repeat the provider's reason rather than
      // asking again on every keystroke. This never marks a pair verified.
      throw new AppError("SWAP_UNAVAILABLE", known.reason ?? "This pair cannot be swapped right now. Choose a different pair.", 502);
    }
    let body: Record<string, unknown>;
    try {
      body = await this.request(`/exchange/estimated-amount?${query}`) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof AppError) this.availability.record(canonicalFrom, canonicalTo, false, error.message);
      throw error;
    }
    this.availability.record(canonicalFrom, canonicalTo, true);
    const estimatedAmount = typeof body.estimatedAmount === "number" || typeof body.estimatedAmount === "string" ? String(body.estimatedAmount) : "";
    if (!AMOUNT.test(estimatedAmount)) throw new AppError("SWAP_UNAVAILABLE", "The swap provider could not return a valid quote.", 502);
    const validUntil = new Date(Date.now() + QUOTE_TTL_MS).toISOString();
    const minimumAmount = typeof body.minAmount === "number" || typeof body.minAmount === "string" ? String(body.minAmount) : undefined;
    const quote: SwapQuote = { provider: "CHANGENOW", fromAsset: canonicalFrom, toAsset: canonicalTo, fromAmount, estimatedAmount, validUntil, ...(minimumAmount ? { minimumAmount } : {}) };
    const payload: QuotePayload = { ...quote, userId, ...(typeof body.rateId === "string" ? { rateId: body.rateId } : {}) };
    return { quote, quoteToken: this.sign(payload) };
  }

  async createOrder(userId: string, quoteToken: string, resolveAddress: (asset: SwapAsset) => string): Promise<{ order: SwapOrder; orderReference: string }> {
    const quote = this.verify<QuotePayload>(quoteToken);
    if (quote.userId !== userId || Date.parse(quote.validUntil) <= Date.now()) throw new AppError("QUOTE_EXPIRED", "This swap quote expired. Request a new quote before creating an order.", 410);
    const payoutAddress = resolveAddress(quote.toAsset);
    const refundAddress = resolveAddress(quote.fromAsset);
    const body = await this.request("/exchange", {
      method: "POST",
      body: JSON.stringify({
        fromCurrency: quote.fromAsset.ticker, toCurrency: quote.toAsset.ticker,
        fromNetwork: quote.fromAsset.network, toNetwork: quote.toAsset.network,
        fromAmount: quote.fromAmount, address: payoutAddress, refundAddress,
        flow: "standard", type: "direct", ...(quote.rateId ? { rateId: quote.rateId } : {})
      })
    }) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id : "";
    const payinAddress = typeof body.payinAddress === "string" ? body.payinAddress : "";
    if (!SAFE_ID.test(id) || payinAddress.length < 20 || payinAddress.length > 180) throw new AppError("SWAP_UNAVAILABLE", "The swap provider returned an invalid order.", 502);
    const order: SwapOrder = {
      provider: "CHANGENOW", id, status: typeof body.status === "string" ? body.status : "new",
      fromAsset: quote.fromAsset, toAsset: quote.toAsset, fromAmount: quote.fromAmount,
      expectedAmount: typeof body.amountTo === "number" || typeof body.amountTo === "string" ? String(body.amountTo) : quote.estimatedAmount,
      payinAddress, payoutAddress, createdAt: new Date().toISOString()
    };
    const reference: OrderReference = { userId, orderId: id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString() };
    return { order, orderReference: this.sign(reference) };
  }

  async status(userId: string, orderReference: string): Promise<Record<string, unknown>> {
    const reference = this.verify<OrderReference>(orderReference);
    if (reference.userId !== userId || Date.parse(reference.expiresAt) <= Date.now() || !SAFE_ID.test(reference.orderId)) throw new AppError("QUOTE_EXPIRED", "This swap order reference is invalid or expired.", 410);
    const body = await this.request(`/exchange/by-id?id=${encodeURIComponent(reference.orderId)}`);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("SWAP_UNAVAILABLE", "The swap provider returned an invalid order status.", 502);
    const safe = body as Record<string, unknown>;
    return {
      id: reference.orderId,
      status: typeof safe.status === "string" ? safe.status : "unknown",
      payinHash: typeof safe.payinHash === "string" ? safe.payinHash : undefined,
      payoutHash: typeof safe.payoutHash === "string" ? safe.payoutHash : undefined,
      updatedAt: new Date().toISOString()
    };
  }
}
