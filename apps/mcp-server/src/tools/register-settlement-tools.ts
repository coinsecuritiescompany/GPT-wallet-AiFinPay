import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppContext } from "../context.js";

const routeSchema = z.enum(["AIFP-1", "AIFP-2"]);
const chainSchema = z.enum([
  "polygon", "avalanche", "arbitrum", "bnb", "base", "unichain", "optimism", "botchain", "xrplevm",
  "solana", "near", "aptos", "casper"
]);
const assetSchema = z.string().min(2).max(16).regex(/^[A-Za-z0-9]+$/).optional();
const amountSchema = z.string().regex(/^[1-9]\d*$/, "Use an integer amount in the asset's base units");
const orderSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/);

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
    if (!response.ok) {
      return { ok: false, status: response.status, ...body };
    }
    return { ok: true, status: response.status, ...body };
  } catch (error) {
    return { ok: false, status: 503, error: "settlement_api_unavailable", detail: error instanceof Error ? error.message : "request_failed" };
  } finally {
    clearTimeout(timeout);
  }
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
    return result(payload.ok === true ? "AiFinPay settlement readiness loaded." : "AiFinPay settlement readiness is currently unavailable.", {
      view: "settlement-routes",
      ...payload
    });
  });

  registerAppTool(server, "prepare_aifinpay_settlement", {
    title: "Prepare AiFinPay settlement",
    description: "Requests a canonical fail-closed AIFP-1 or AIFP-2 settlement invoice. This prepares a transaction plan only; the Vault must still review and sign locally before any value can move.",
    inputSchema: {
      routeClass: routeSchema,
      chain: chainSchema,
      merchantWallet: z.string().min(2).max(128),
      grossAmount: amountSchema,
      asset: assetSchema,
      orderId: orderSchema
    },
    outputSchema: z.object({ view: z.literal("settlement-invoice") }).passthrough(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true, idempotentHint: true },
    _meta: { securitySchemes: [{ type: "noauth" }] }
  }, async ({ routeClass, chain, merchantWallet, grossAmount, asset, orderId }) => {
    const payload = await jsonRequest(ctx.config.settlementApiOrigin, "/v1/settlement/invoice", {
      method: "POST",
      body: JSON.stringify({
        route_class: routeClass,
        chain,
        merchant_wallet: merchantWallet,
        gross_amount: grossAmount,
        ...(asset ? { asset: asset.toUpperCase() } : {}),
        order_id: orderId
      })
    }) as Record<string, unknown>;
    return result(payload.ok === true
      ? "Canonical settlement invoice prepared. Review the transaction plan before local Vault signing."
      : "Settlement invoice was not issued; the route remains fail-closed.", {
        view: "settlement-invoice",
        requiresLocalVaultSignature: true,
        ...payload
      });
  });
}
