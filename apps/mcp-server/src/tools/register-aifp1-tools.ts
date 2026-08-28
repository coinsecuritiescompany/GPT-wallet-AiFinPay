import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AppError, evmAddressSchema, idempotencyKeySchema, networkSchema, safeError,
  type NetworkId, type PaymentIntent
} from "@aifinpay/shared";
import type { AppContext } from "../context.js";

const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const toolOutputSchema = z.object({ view: z.string().min(1) }).passthrough();

function oauthMeta(): Record<string, unknown> {
  return { securitySchemes: [{ type: "oauth2", scopes: ["wallet:write"] }] };
}

function data(message: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: message }], structuredContent };
}

function failure(error: unknown, ctx: AppContext) {
  const safe = safeError(error);
  const challenge = safe.code === "AUTH_REQUIRED"
    ? { "mcp/www_authenticate": [`Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/mcp", ctx.config.widgetDomain).href}", error="invalid_token", error_description="Connect AiFinPay Wallet once to continue"`] }
    : {};
  return { isError: true, ...data(safe.message, { view: "error", error: safe }), _meta: challenge };
}

function resolveUser(ctx: AppContext, extra: { authInfo?: AuthInfo }) {
  if (extra.authInfo && !extra.authInfo.scopes.includes("wallet:write")) {
    throw new AppError("AUTH_REQUIRED", "Reconnect AiFinPay Wallet with wallet:write permission to continue.", 401);
  }
  const user = ctx.auth.resolve(extra.authInfo);
  if (user.addresses) ctx.store.upsertWalletConnection(user.userId, user.addresses);
  return user;
}

function publicIntent(intent: PaymentIntent) {
  const safe = { ...intent } as Partial<PaymentIntent>;
  delete safe.ownerUserId;
  delete safe.walletId;
  return safe;
}

function signingEnabled(ctx: AppContext, network: NetworkId): boolean {
  return ctx.config.walletMode === "mainnet" && ctx.config.signingNetworks.includes(network);
}

function buildSignUrl(ctx: AppContext, userId: string, intent: PaymentIntent): string {
  const token = ctx.signing.issue({ intentId: intent.id, userId, expiresAt: intent.expiresAt });
  const url = new URL("/vault", ctx.config.widgetDomain);
  url.searchParams.set("sign", token);
  return url.href;
}

export function registerAifp1Tools(server: McpServer, ctx: AppContext): void {
  registerAppTool(server, "prepare_contract_call", {
    title: "Prepare AIFP-1 contract settlement",
    description: "Use this for an AIFP-1 quote that contains an EVM settlement_call. Never replace settlement_call with prepare_transfer or pay_to. The wallet independently checks the trusted v1.3 route, decodes payNative calldata, enforces creator=0, value=grossAmount, expiry and a gross USD budget, then returns one local Vault signing link. No separate ChatGPT confirmation step is required.",
    inputSchema: {
      network: networkSchema,
      chainId: z.number().int().positive(),
      to: evmAddressSchema,
      value: z.string().regex(/^(?:0x[0-9a-fA-F]+|[0-9]+)$/, "Use an exact atomic integer or 0x quantity"),
      data: z.string().regex(/^0x[0-9a-fA-F]+$/, "Expected non-empty EVM calldata"),
      grossUsd: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, "Use an exact decimal USD string"),
      initiatedByAgentId: z.string().min(2).max(80).optional(),
      idempotencyKey: idempotencyKeySchema
    },
    outputSchema: toolOutputSchema,
    annotations: write,
    _meta: oauthMeta()
  }, async (args, extra) => {
    try {
      if (!signingEnabled(ctx, args.network)) {
        throw new AppError("SIGNING_FAILED", `AIFP-1 signing on ${args.network} is not enabled in this deployment.`, 501);
      }
      const user = resolveUser(ctx, extra);
      const prepared = ctx.aifp1.prepare(user.userId, args);
      const signUrl = buildSignUrl(ctx, user.userId, prepared.intent);
      return data("AIFP-1 settlement verified and prepared. Open the AiFinPay Vault to review the decoded contract call and sign it locally.", {
        view: "contract-call-preview",
        intent: publicIntent(prepared.intent),
        decoded: prepared.decoded,
        signUrl
      });
    } catch (error) {
      return failure(error, ctx);
    }
  });
}
