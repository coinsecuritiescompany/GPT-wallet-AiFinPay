import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";

const routeSchema = z.enum(["AIFP-1", "AIFP-2"]);
const chainSchema = z.enum([
  "polygon", "avalanche", "arbitrum", "bnb", "base", "unichain", "optimism", "botchain", "xrplevm",
  "solana", "near", "aptos", "casper"
]);
const stableSchema = z.enum(["USDC", "USDT"]);
const assetSchema = z.string().min(2).max(16).regex(/^[A-Za-z0-9]+$/).optional();
const amountSchema = z.string().regex(/^[1-9]\d*$/, "Use an integer amount in the asset's base units");
const decimalAmountSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine((v) => Number(v) > 0, "Amount must be positive");
const orderSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);
const sessionSchema = z.string().regex(/^stl_[0-9a-f]{32}$/);

function result(message: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: message }], structuredContent };
}

async function jsonRequest(base: string, path: string, init?: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as Record<string, unknown>;
    if (!response.ok) return { ok: false, status: response.status, ...body };
    return { ok: true, status: response.status, ...body };
  } catch (error) {
    return { ok: false, status: 503, error: "settlement_api_unavailable", detail: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

function publicSession(session: ReturnType<AppContext["settlementExecution"]["getSession"]> extends infer T ? Exclude<T, null> : never) {
  const { ownerUserId: _ownerUserId, transaction: _transaction, ...safe } = session;
  return safe;
}

export function registerSettlementTools(server: McpServer, ctx: AppContext): void {
  registerAppTool(server, "list_aifinpay_settlement_routes", {
    title: "List AiFinPay settlement routes",
    description: "Returns the canonical AIFP-1/AIFP-2 readiness matrix for all 13 AiFinPay networks. A route is live only when deployment evidence and paid-E2E approval are present.",
    inputSchema: { routeClass: routeSchema.optional() },
    outputSchema: z.object({ view: z.literal("settlement-routes") }).passthrough(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: { securitySchemes: [{ type: "noauth" }] }
  }, async ({ routeClass }) => {
    const query = routeClass ? `?route_class=${encodeURIComponent(routeClass)}` : "";
    const payload = await jsonRequest(ctx.config.settlementApiOrigin, `/v1/settlement/routes${query}`) as Record<string, unknown>;
    return result(payload.ok === true ? "AiFinPay settlement readiness loaded." : "AiFinPay settlement readiness is currently unavailable.", { view: "settlement-routes", ...payload });
  });

  registerAppTool(server, "prepare_aifinpay_settlement", {
    title: "Prepare AiFinPay settlement invoice",
    description: "Requests a canonical fail-closed AIFP-1 or AIFP-2 invoice without creating a signing session. No funds move.",
    inputSchema: { routeClass: routeSchema, chain: chainSchema, merchantWallet: z.string().min(2).max(128), grossAmount: amountSchema, asset: assetSchema, orderId: orderSchema },
    outputSchema: z.object({ view: z.literal("settlement-invoice") }).passthrough(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: { securitySchemes: [{ type: "noauth" }] }
  }, async ({ routeClass, chain, merchantWallet, grossAmount, asset, orderId }) => {
    const payload = await jsonRequest(ctx.config.settlementApiOrigin, "/v1/settlement/invoice", { method: "POST", body: JSON.stringify({ route_class: routeClass, chain, merchant_wallet: merchantWallet, gross_amount: grossAmount, ...(asset ? { asset: asset.toUpperCase() } : {}), order_id: orderId }) }) as Record<string, unknown>;
    return result(payload.ok === true ? "Canonical settlement invoice prepared. No funds moved." : "Settlement invoice was not issued; the route remains fail-closed.", { view: "settlement-invoice", requiresLocalVaultSignature: true, ...payload });
  });

  registerAppTool(server, "prepare_aifinpay_settlement_for_vault", {
    title: "Prepare AiFinPay settlement for Vault",
    description: "Builds the exact transaction from a canonical invoice after wallet-side trusted-pin and on-chain checks, then returns a short-lived local Vault signing link. It does not sign or broadcast by itself.",
    inputSchema: { routeClass: routeSchema, chain: chainSchema, merchantWallet: z.string().min(2).max(128), grossAmount: amountSchema, asset: assetSchema, orderId: orderSchema },
    outputSchema: z.object({ view: z.literal("settlement-signing") }).passthrough(),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: false },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["wallet:write"] }] }
  }, async ({ routeClass, chain, merchantWallet, grossAmount, asset, orderId }, extra: { authInfo?: AuthInfo }) => {
    try {
      if (extra.authInfo && !extra.authInfo.scopes.includes("wallet:write")) throw new Error("wallet:write permission is required");
      const user = ctx.auth.resolve(extra.authInfo);
      const session = await ctx.settlementExecution.prepare(user.userId, { routeClass, chain, merchantWallet, grossAmount, ...(asset ? { asset: asset.toUpperCase() } : {}), orderId });
      const token = ctx.signing.issue({ intentId: session.id, userId: user.userId, expiresAt: session.expiresAt });
      const signUrl = new URL("/vault", ctx.config.widgetDomain);
      signUrl.searchParams.set("sign", token);
      return result(
        session.stage === "APPROVAL"
          ? "The stablecoin allowance transaction is ready for local Vault review. After it confirms, prepare the settlement again for the contract call."
          : "The canonical settlement transaction is ready for local Vault review and signature.",
        { view: "settlement-signing", ok: true, session: publicSession(session), signUrl: signUrl.href, requiresLocalVaultSignature: true }
      );
    } catch (error) {
      return result("Settlement signing was not prepared. The wallet failed closed before any value could move.", { view: "settlement-signing", ok: false, error: error instanceof Error ? error.message : "settlement_prepare_failed" });
    }
  });

  registerAppTool(server, "get_aifinpay_settlement_status", {
    title: "Get AiFinPay settlement status",
    description: "Checks a locally prepared settlement session. NEAR is confirmed only after the contract reports SETTLED, not merely after transaction inclusion.",
    inputSchema: { settlementSessionId: sessionSchema },
    outputSchema: z.object({ view: z.literal("settlement-status") }).passthrough(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["wallet:read"] }] }
  }, async ({ settlementSessionId }, extra: { authInfo?: AuthInfo }) => {
    try {
      const user = ctx.auth.resolve(extra.authInfo);
      const session = await ctx.settlementExecution.refresh(user.userId, settlementSessionId);
      const nextAction = session.stage === "APPROVAL" && session.status === "CONFIRMED"
        ? "Prepare the same settlement again; the wallet will now build the contract payment instead of another approval."
        : session.status === "PENDING" ? "Wait for final settlement confirmation." : undefined;
      return result(`Settlement session is ${session.status}.`, { view: "settlement-status", ok: true, session: publicSession(session), ...(nextAction ? { nextAction } : {}) });
    } catch (error) {
      return result("Settlement status could not be loaded.", { view: "settlement-status", ok: false, error: error instanceof Error ? error.message : "settlement_status_failed" });
    }
  });

  registerAppTool(server, "quote_aifinpay_settlement_swap", {
    title: "Quote stablecoin for AiFinPay settlement",
    description: "Routes an existing wallet asset toward an issuer-verified USDC/USDT settlement target. AiFinPay validates the target, while ChangeNOW currently supplies external swap liquidity. A quote never moves funds.",
    inputSchema: { sourceNetwork: chainSchema, sourceTicker: z.string().min(2).max(30).regex(/^[A-Za-z0-9-]+$/), fromAmount: decimalAmountSchema, stable: stableSchema.optional(), targetNetwork: chainSchema.optional() },
    outputSchema: z.object({ view: z.literal("settlement-swap-quote") }).passthrough(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: { securitySchemes: [{ type: "oauth2", scopes: ["wallet:read"] }] }
  }, async ({ sourceNetwork, sourceTicker, fromAmount, stable, targetNetwork }, extra: { authInfo?: AuthInfo }) => {
    const user = ctx.auth.resolve(extra.authInfo);
    const connection = ctx.store.getWalletConnection(user.userId);
    if (!connection) return result("Connect AiFinPay Wallet before requesting a settlement swap quote.", { view: "settlement-swap-quote", ok: false, error: "wallet_not_connected" });
    try {
      const quote = await ctx.settlementSwaps.quoteToStable(user.userId, { sourceNetwork, sourceTicker: sourceTicker.toLowerCase(), fromAmount, ...(stable ? { stable } : {}), ...(targetNetwork ? { targetNetwork } : {}) });
      return result(`Settlement swap quote prepared: ${quote.settlementAsset} on ${quote.settlementNetwork}. Liquidity is provided externally by ChangeNOW; no funds moved.`, { view: "settlement-swap-quote", ok: true, ...quote });
    } catch (error) {
      return result("No reviewed automatic settlement swap route is currently available for that request.", { view: "settlement-swap-quote", ok: false, error: error instanceof Error ? error.message : "settlement_swap_unavailable" });
    }
  });
}
