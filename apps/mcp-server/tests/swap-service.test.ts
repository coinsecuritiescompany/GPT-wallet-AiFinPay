import { afterEach, describe, expect, it, vi } from "vitest";
import { SwapService, providerFailureMessage } from "../src/services/swap-service.js";

const cspr = { ticker: "cspr", name: "Casper", network: "cspr" };
const pol = { ticker: "pol", name: "Polygon Ecosystem Token", network: "matic" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("SwapService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fails closed without a provider key", async () => {
    const service = new SwapService(undefined, "a-secret-that-is-long-enough-for-tests");
    await expect(service.listAssets()).rejects.toMatchObject({ code: "SWAP_UNAVAILABLE" });
  });

  it("binds quotes and orders to the authenticated user and Vault addresses", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([cspr, pol]))
      .mockResolvedValueOnce(json({ estimatedAmount: "112.45", rateId: "rate-1", minAmount: "1" }))
      .mockResolvedValueOnce(json({ id: "order_123456", status: "new", payinAddress: `01${"a".repeat(64)}`, amountTo: "112.45" }))
      .mockResolvedValueOnce(json({ id: "order_123456", status: "exchanging", payinHash: "hash-in" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    const { quote, quoteToken } = await service.quote("user-1", cspr, pol, "10");
    expect(quote.estimatedAmount).toBe("112.45");
    const resolveAddress = vi.fn((asset: typeof cspr) => asset.network === "matic" ? `0x${"b".repeat(40)}` : `01${"c".repeat(64)}`);
    const result = await service.createOrder("user-1", quoteToken, resolveAddress);
    expect(result.order.payoutAddress).toBe(`0x${"b".repeat(40)}`);
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ "x-changenow-api-key": "private-provider-key" });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as Record<string, string>;
    expect(requestBody).toMatchObject({ fromCurrency: "cspr", toCurrency: "pol", address: `0x${"b".repeat(40)}`, refundAddress: `01${"c".repeat(64)}` });
    await expect(service.createOrder("user-2", quoteToken, resolveAddress)).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    await expect(service.status("user-2", result.orderReference)).rejects.toMatchObject({ code: "QUOTE_EXPIRED" });
    await expect(service.status("user-1", result.orderReference)).resolves.toMatchObject({ status: "exchanging", payinHash: "hash-in" });
  });

  it("does not send useRateId on a standard-flow quote", async () => {
    // ChangeNOW rejects flow=standard&type=direct when useRateId is present:
    // "standard flow and direct type is unsupported if useRateId flag is true".
    // Sending it made every quote fail for every pair and every amount, which is
    // why the swap never once produced a live price.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([cspr, pol]))
      .mockResolvedValueOnce(json({ estimatedAmount: "112.45", minAmount: "1" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    await service.quote("user-1", cspr, pol, "10");
    const quoteUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(quoteUrl).toContain("flow=standard");
    expect(quoteUrl).toContain("type=direct");
    expect(quoteUrl).not.toContain("useRateId");
  });

  it("quotes a standard flow that returns no rate id", async () => {
    // A standard flow answers with rateId: null. The quote must still succeed
    // and the order must simply omit the field.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([cspr, pol]))
      .mockResolvedValueOnce(json({ estimatedAmount: "0.0031855", rateId: null, validUntil: null })));
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    await expect(service.quote("user-1", cspr, pol, "140")).resolves.toMatchObject({
      quote: { estimatedAmount: "0.0031855" }
    });
  });

  it("surfaces the real reason when the provider sends an empty message", async () => {
    // {"error":"pair_is_inactive","message":""} — an empty string passes a
    // typeof check, so reading message alone produced an empty error and the
    // widget showed its generic fallback instead of the actual cause.
    expect(providerFailureMessage({ error: "pair_is_inactive", message: "" }))
      .toContain("cannot be swapped");
    expect(providerFailureMessage({ error: "deposit_too_small", message: "" }))
      .toContain("minimum");
    // A real message from the provider always wins.
    expect(providerFailureMessage({ error: "not_valid_params", message: "Currency pol is not supported" }))
      .toBe("Currency pol is not supported");
    // An unknown code is still better than silence.
    expect(providerFailureMessage({ error: "some_new_code", message: "" }))
      .toContain("some_new_code");
    expect(providerFailureMessage(null)).toBe("The swap provider rejected this request.");
  });

  it("passes the provider's refusal through to the caller", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([cspr, pol]))
      .mockResolvedValueOnce(json({ error: "pair_is_inactive", message: "" }, 422)));
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    await expect(service.quote("user-1", cspr, pol, "10")).rejects.toMatchObject({
      code: "SWAP_UNAVAILABLE",
      message: expect.stringContaining("cannot be swapped")
    });
  });

  it("rejects malformed provider responses", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json([cspr, pol]))
      .mockResolvedValueOnce(json({ estimatedAmount: "not-an-amount" })));
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    await expect(service.quote("user-1", cspr, pol, "10")).rejects.toMatchObject({ code: "SWAP_UNAVAILABLE" });
  });

  it("rejects asset objects that are not in the provider's active registry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json([cspr, pol])));
    const service = new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");
    await expect(service.quote("user-1", { ticker: "fake", name: "Fake", network: "matic" }, pol, "10"))
      .rejects.toMatchObject({ code: "NETWORK_UNSUPPORTED" });
  });
});
