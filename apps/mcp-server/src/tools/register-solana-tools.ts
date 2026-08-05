import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import {
  AppError, decimalAmountSchema, idempotencyKeySchema, safeError, solanaAddressSchema,
  type NetworkId, type PaymentIntent
} from "@aifinpay/shared";
import type { AppContext } from "../context.js";
import { WIDGET_URI } from "./register-tools.js";

const outputSchema = z.object({ view: z.string().min(1) }).passthrough();
const annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const nearAddressSchema = z.string().transform((value) => value.toLowerCase()).pipe(z.string().regex(/^[a-z0-9._-]{2,64}$/, "Expected a valid NEAR account ID"));
const aptosAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{1,64}$/, "Expected a valid Aptos address");
// Casper ed25519 public key: the 01 algorithm tag followed by 32 bytes.
// Either Casper algorithm is a valid recipient: 01 + 32 bytes (ed25519) or
// 02 + 33 bytes (secp256k1). Only the sender must be ed25519.
const casperAddressSchema = z.string().transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^(01[0-9a-f]{64}|02[0-9a-f]{66})$/, "Expected a Casper public key: 01 + 32 bytes (ed25519) or 02 + 33 bytes (secp256k1)"));

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

function registerNativeTransfer(
  server: McpServer,
  ctx: AppContext,
  settings: {
    name: string;
    title: string;
    description: string;
    recipientSchema: z.ZodType<string>;
    network: Extract<NetworkId, "SOLANA" | "NEAR" | "APTOS" | "CASPER">;
    symbol: string;
  }
): void {
  registerAppTool(server, settings.name, {
    title: settings.title,
    description: settings.description,
    inputSchema: {
      recipient: settings.recipientSchema,
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
      if (ctx.config.walletMode !== "mainnet" || !ctx.config.signingNetworks.includes(settings.network)) {
        throw new AppError("SIGNING_FAILED", `Native ${settings.symbol} sending is not enabled in this deployment.`, 501);
      }
      const user = resolveUser(ctx, extra.authInfo);
      const result = await ctx.payments.prepare(user.userId, {
        recipient,
        amount,
        token: "POL",
        network: settings.network,
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
      return data(`Native ${settings.symbol} transfer prepared. Open the AiFinPay Vault on this device to review and sign the exact transaction.`, {
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

export function registerSolanaTools(server: McpServer, ctx: AppContext): void {
  registerNativeTransfer(server, ctx, {
    name: "prepare_solana_transfer",
    title: "Prepare native SOL transfer",
    description: "Use only when the user asks to send native SOL on Solana mainnet. It checks the live balance and fee, then requires local Ed25519 signing in the Vault.",
    recipientSchema: solanaAddressSchema,
    network: "SOLANA",
    symbol: "SOL"
  });
  registerNativeTransfer(server, ctx, {
    name: "prepare_near_transfer",
    title: "Prepare native NEAR transfer",
    description: "Use only when the user asks to send native NEAR on NEAR mainnet. It reads the access-key nonce and block hash, builds one Borsh Transfer action, and requires local Ed25519 signing in the Vault.",
    recipientSchema: nearAddressSchema,
    network: "NEAR",
    symbol: "NEAR"
  });
  registerNativeTransfer(server, ctx, {
    name: "prepare_casper_transfer",
    title: "Prepare native CSPR transfer",
    description: "Use only when the user asks to send native CSPR on Casper mainnet. It builds a Casper transfer deploy, checks the live balance against the amount plus the 0.1 CSPR fee, and requires local Ed25519 signing of the deploy hash in the Vault. Casper rejects native transfers below 2.5 CSPR.",
    recipientSchema: casperAddressSchema,
    network: "CASPER",
    symbol: "CSPR"
  });
  registerNativeTransfer(server, ctx, {
    name: "prepare_aptos_transfer",
    title: "Prepare native APT transfer",
    description: "Use only when the user asks to send native APT on Aptos mainnet. It builds an aptos_account::transfer request, obtains canonical signing bytes from the fullnode, and requires local Ed25519 signing in the Vault.",
    recipientSchema: aptosAddressSchema,
    network: "APTOS",
    symbol: "APT"
  });
}
