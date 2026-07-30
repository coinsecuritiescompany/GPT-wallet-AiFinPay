import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import {
  AppError, decimalAmountSchema, idempotencyKeySchema, safeError, solanaAddressSchema,
  type PaymentIntent
} from "@aifinpay/shared";
import type { AppContext } from "../context.js";
import { WIDGET_URI } from "./register-tools.js";

const outputSchema = z.object({ view: z.string().min(1) }).passthrough();
const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };

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

function resolveUser(ctx: AppContext, authInfo?: AuthInfo) {
  if (authInfo && !authInfo.scopes.includes("wallet:write")) {
    throw new AppError("AUTH_REQUIRED", "Reconnect AiFinPay Wallet with wallet:write permission to continue.", 401);
  }
  const user = ctx.auth.resolve(authInfo);
  if (user.addresses) ctx.store.upsertWalletConnection(user.userId, user.addresses);
  return user;
}

function publicIntent(intent: PaymentIntent) {
  const safe = { ...intent } as Partial<PaymentIntent>;
  delete safe.ownerUserId;
  delete safe.walletId;
  return safe;
}

function signUrl(ctx: AppContext, userId: string, intent: PaymentIntent): string {
  const token = ctx.signing.issue({ intentId: intent.id, userId, expiresAt: intent.expiresAt });
  const url = new URL("/vault", ctx.config.widgetDomain);
  url.searchParams.set("sign", token);
  return url.href;
}

export function registerSolanaTools(server: McpServer, ctx: AppContext): void {
  registerAppTool(server, "prepare_solana_transfer", {
    title: "Prepare native SOL transfer",
    description: "Use this only when the user asks to send native SOL on Solana mainnet. It validates a Solana recipient, checks live SOL balance and fee, then returns a local Vault review-and-sign link. It never handles seed phrases or server-side signing.",
    inputSchema: {
      recipient: solanaAddressSchema,
      amount: decimalAmountSchema,
      memo: z.string().max(280).optional(),
      idempotencyKey: idempotencyKeySchema
    },
    outputSchema,
    annotations,
    _meta: {
      securitySchemes: [{ type: "oauth2", scopes: ["wallet:write"] }],
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI
    }
  }, async ({ recipient, amount, memo, idempotencyKey }, extra) => {
    try {
      if (ctx.config.walletMode !== "mainnet" || !ctx.config.signingNetworks.includes("SOLANA")) {
        throw new AppError("SIGNING_FAILED", "Native SOL sending is not enabled in this deployment.", 501);
      }
      const user = resolveUser(ctx, extra.authInfo);
      const result = await ctx.payments.prepare(user.userId, {
        recipient,
        amount,
        token: "POL",
        network: "SOLANA",
        ...(memo ? { memo } : {}),
        idempotencyKey
      });
      if (result.intent.status === "BLOCKED") {
        return data("Blocked by AiFinPay Policy Engine.", {
          view: "blocked",
          intent: publicIntent(result.intent),
          policyExplanation: result.policyExplanation
        });
      }
      return data("Native SOL transfer prepared. Open the AiFinPay Vault on this device to review and sign the exact Solana transaction.", {
        view: "transfer-preview",
        intent: publicIntent(result.intent),
        signUrl: signUrl(ctx, user.userId, result.intent),
        confirmationToken: result.confirmationToken,
        policyExplanation: result.policyExplanation
      });
    } catch (error) {
      return failure(error, ctx);
    }
  });
}
