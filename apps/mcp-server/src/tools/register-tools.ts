import { evaluatePolicy } from "@aifinpay/aifinpay-adapter";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import {
  AppError, MAINNET_NETWORKS, decimalAmountSchema, evmAddressSchema, idempotencyKeySchema, networkMeta, networkSchema, safeError, tokenSchema,
  type NetworkId, type PaymentIntent
} from "@aifinpay/shared";
import type { AppContext } from "../context.js";

export const WIDGET_URI = "ui://aifinpay/wallet-v8.html";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true };
function oauthMeta(render = false, scope: "wallet:read" | "wallet:write" = "wallet:read"): Record<string, unknown> {
  return {
    securitySchemes: [{ type: "oauth2", scopes: [scope] }],
    ...(render ? { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } : {})
  };
}

function data(message: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: message }], structuredContent };
}

function rendered(message: string, structuredContent: Record<string, unknown>) {
  return { ...data(message, structuredContent), _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
}

function failure(error: unknown, ctx: AppContext) {
  const safe = safeError(error);
  const challenge = safe.code === "AUTH_REQUIRED"
    ? { "mcp/www_authenticate": [`Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/mcp", ctx.config.widgetDomain).href}", error="invalid_token", error_description="Connect AiFinPay Wallet once to continue"`] }
    : {};
  return { isError: true, ...data(safe.message, { view: "error", error: safe }), _meta: challenge };
}

function resolveUser(ctx: AppContext, extra: { authInfo?: AuthInfo }, requiredScope: "wallet:read" | "wallet:write" = "wallet:read") {
  if (extra.authInfo && !extra.authInfo.scopes.includes(requiredScope)) throw new AppError("AUTH_REQUIRED", `Reconnect AiFinPay Wallet with ${requiredScope} permission to continue.`, 401);
  const user = ctx.auth.resolve(extra.authInfo);
  if (user.addresses) ctx.store.upsertWalletConnection(user.userId, user.addresses);
  return user;
}

// The connected Vault has an address on every network, so any of the 13
// mainnets is selectable in mainnet mode. When the caller does not specify one,
// default to Polygon (mainnet) or Polygon Amoy (demo ledger).
function resolveNetwork(ctx: AppContext, network?: NetworkId): NetworkId {
  return network ?? (ctx.config.walletMode === "mainnet" ? "POLYGON" : "POLYGON_AMOY");
}

function publicIntent(intent: PaymentIntent) {
  const safe = { ...intent } as Partial<PaymentIntent>;
  delete safe.ownerUserId;
  delete safe.walletId;
  return safe;
}

// Non-custodial sending is switched on per-network via AIFINPAY_SIGNING_NETWORKS.
// When off (the production default), mainnet prepare/confirm fail closed.
function signingEnabled(ctx: AppContext, network: NetworkId): boolean {
  return ctx.config.walletMode === "mainnet" && ctx.config.signingNetworks.includes(network);
}

// The device link that opens the intent in the Vault for local signing.
function buildSignUrl(ctx: AppContext, userId: string, intent: PaymentIntent): string {
  const token = ctx.signing.issue({ intentId: intent.id, userId, expiresAt: intent.expiresAt });
  const url = new URL("/vault", ctx.config.widgetDomain);
  url.searchParams.set("sign", token);
  return url.href;
}

const prepareSchema = {
  recipient: evmAddressSchema,
  amount: decimalAmountSchema,
  token: tokenSchema,
  network: networkSchema,
  memo: z.string().max(280).optional(),
  initiatedByAgentId: z.string().min(2).max(80).optional(),
  merchantId: z.string().min(2).max(120).optional(),
  merchantCategory: z.string().min(2).max(80).optional(),
  purpose: z.string().min(2).max(280).optional(),
  idempotencyKey: idempotencyKeySchema
};

const policyDraftSchema = {
  agentId: z.string().min(2).max(80),
  name: z.string().min(2).max(100),
  dailyLimit: decimalAmountSchema,
  perTransactionLimit: decimalAmountSchema,
  tokenAllowlist: z.array(tokenSchema).min(1),
  networkAllowlist: z.array(networkSchema).min(1),
  allowedRecipients: z.array(evmAddressSchema).default([]),
  allowedMerchantCategories: z.array(z.string().min(2).max(80)).default([]),
  merchantAllowlist: z.array(z.string().min(2).max(120)).default([]),
  approvalThreshold: decimalAmountSchema,
  validUntil: z.string().datetime()
};

export function registerTools(server: McpServer, ctx: AppContext): void {
  registerAppTool(server, "list_supported_mainnets", {
    title: "List supported AiFinPay mainnets",
    description: "Use this when the user asks which mainnet address networks the AiFinPay Vault derives. The result explicitly identifies whether signing is enabled.",
    inputSchema: {}, annotations: readOnly, _meta: { securitySchemes: [{ type: "noauth" }] }
  }, async () => data("AiFinPay supports addresses on 13 mainnet networks. Signing is enabled gradually after contract and treasury verification.", { view: "networks", networks: MAINNET_NETWORKS }));

  // Opening/viewing the wallet is a read operation — it must require only
  // wallet:read. Marking it write (readOnlyHint:false) makes ChatGPT demand the
  // wallet:write tier to open the wallet, which produced a "needs more access"
  // reconnect loop for a read-only connection. Both open tools below keep the
  // annotation and the OAuth scheme on wallet:read.
  const openWallet = async (_args: Record<string, never>, extra: { authInfo?: AuthInfo }) => {
    try {
      const user = resolveUser(ctx, extra);
      const connection = ctx.store.getWalletConnection(user.userId);
      if (!connection) throw new AppError("AUTH_REQUIRED", "Connect AiFinPay Wallet once to continue.", 401);
      const summary = await ctx.adapter.getWalletSummary(user.userId, "POLYGON");
      summary.activeAgentPolicies = ctx.store.listPolicies(user.userId).filter((policy) => policy.enabled);
      return rendered("AiFinPay wallet opened.", { view: "wallet", summary: { ...summary, address: undefined }, connection, networks: MAINNET_NETWORKS });
    } catch (error) { return failure(error, ctx); }
  };

  // Preferred entry point. Introduced as a fresh tool name so ChatGPT re-registers
  // the permission contract (read-only, wallet:read) instead of reusing a cached
  // schema that still demanded wallet:write from create_wallet_pairing.
  registerAppTool(server, "open_wallet", {
    title: "Open AiFinPay Wallet",
    description: "Use this when the user asks to open, view, or connect their AiFinPay Wallet. Opening and viewing the wallet is read-only; returning users go straight to the dashboard without re-authorizing.",
    inputSchema: {}, annotations: readOnly, _meta: oauthMeta(true)
  }, openWallet);

  registerAppTool(server, "create_wallet_pairing", {
    title: "Open AiFinPay Wallet (deprecated — use open_wallet)",
    description: "Deprecated alias of open_wallet, kept for backward compatibility. Prefer open_wallet. Opening and viewing the wallet is read-only; returning users go straight to the dashboard without re-authorizing.",
    inputSchema: {}, annotations: readOnly, _meta: oauthMeta(true)
  }, openWallet);

  registerAppTool(server, "get_wallet_connection", {
    title: "Get wallet connection status",
    description: "Use this to check whether the user's non-custodial AiFinPay Vault is connected. Only public blockchain addresses are returned.",
    inputSchema: {}, annotations: readOnly, _meta: oauthMeta()
  }, async (_args, extra) => {
    try {
      const user = resolveUser(ctx, extra);
      const connection = ctx.store.getWalletConnection(user.userId);
      return data(connection ? "AiFinPay Vault is connected." : "No AiFinPay Vault is connected yet.", { view: connection ? "wallet-connected" : "not-connected", connection });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "get_wallet_summary", {
    title: "Get AiFinPay wallet summary",
    description: "Use this when the user wants to view their AiFinPay wallet balance, network, recent transaction activity, and active agent limits.",
    inputSchema: { network: networkSchema.optional() }, annotations: readOnly, _meta: oauthMeta()
  }, async ({ network }, extra) => {
    try {
      const user = resolveUser(ctx, extra);
      const selectedNetwork = resolveNetwork(ctx, network);
      const summary = await ctx.adapter.getWalletSummary(user.userId, selectedNetwork);
      summary.activeAgentPolicies = ctx.store.listPolicies(user.userId).filter((policy) => policy.enabled);
      const connection = ctx.store.getWalletConnection(user.userId);
      return data("AiFinPay wallet summary loaded.", { view: "wallet", summary: { ...summary, address: undefined }, connection, networks: MAINNET_NETWORKS });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "get_token_balance", {
    title: "Get token balance",
    description: "Use this when the user asks for the balance of a supported token in their AiFinPay wallet.",
    inputSchema: { token: tokenSchema, network: networkSchema }, annotations: readOnly, _meta: oauthMeta()
  }, async ({ token, network }, extra) => {
    try { const user = resolveUser(ctx, extra); const selectedNetwork = resolveNetwork(ctx, network); return data(`${token} balance loaded.`, { view: "balance", balance: await ctx.adapter.getBalance(user.userId, token, selectedNetwork) }); }
    catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "prepare_transfer", {
    title: "Prepare wallet transfer",
    description: "Use this when the user requests a transfer preview. In demo mode it writes a private demo intent and never broadcasts. In mainnet mode, where sending is enabled for the network, it prepares the intent and returns a device link the user opens to review and sign the payment in their Vault; where sending is not enabled it returns a safety error.",
    inputSchema: prepareSchema, annotations: write, _meta: oauthMeta(false, "wallet:write")
  }, async (args, extra) => {
    try {
      if (ctx.config.walletMode === "mainnet" && !signingEnabled(ctx, args.network)) {
        throw new AppError("SIGNING_FAILED", `Mainnet sending on ${args.network} is not enabled in this deployment.`, 501);
      }
      const user = resolveUser(ctx, extra, "wallet:write");
      const result = await ctx.payments.prepare(user.userId, args);
      if (result.intent.status === "BLOCKED") {
        return data("Blocked by AiFinPay Policy Engine.", { view: "blocked", intent: publicIntent(result.intent), policyExplanation: result.policyExplanation });
      }
      if (signingEnabled(ctx, args.network)) {
        const signUrl = buildSignUrl(ctx, user.userId, result.intent);
        return data("Transfer prepared. Open your AiFinPay Vault on this device to review and sign it — the signed transaction broadcasts automatically. AiFinPay never holds your key.", {
          view: "transfer-preview", intent: publicIntent(result.intent), signUrl, confirmationToken: result.confirmationToken, policyExplanation: result.policyExplanation
        });
      }
      return data("Transfer prepared. Explicit confirmation is required before execution.", {
        view: "transfer-preview", intent: publicIntent(result.intent), confirmationToken: result.confirmationToken, policyExplanation: result.policyExplanation
      });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "confirm_transfer", {
    title: "Confirm prepared transfer",
    description: "Use this only after explicit confirmation of a prepared transfer. In demo mode it irreversibly completes the private demo intent. In mainnet mode the payment is signed on the user's device in their Vault, so this reports the transaction if it has already broadcast, or returns the device signing link to complete it.",
    inputSchema: { transferIntentId: z.string().min(8), confirmationToken: z.string().min(20), idempotencyKey: idempotencyKeySchema }, annotations: destructive, _meta: oauthMeta(false, "wallet:write")
  }, async ({ transferIntentId, confirmationToken }, extra) => {
    try {
      const user = resolveUser(ctx, extra, "wallet:write");
      if (ctx.config.walletMode === "mainnet") {
        const intent = ctx.payments.requireIntent(transferIntentId, user.userId);
        if (!signingEnabled(ctx, intent.network)) throw new AppError("SIGNING_FAILED", `Mainnet broadcasting on ${intent.network} is not enabled in this deployment.`, 501);
        if (intent.transactionHash) {
          return data("Transaction broadcast. It is settling on-chain now.", { view: "receipt", intent: publicIntent(intent), explorerUrl: `${networkMeta(intent.network).explorerBaseUrl}/tx/${intent.transactionHash}` });
        }
        const signUrl = buildSignUrl(ctx, user.userId, intent);
        return data("This payment is signed on your device. Open your AiFinPay Vault to review and sign it — it broadcasts automatically once signed.", { view: "transfer-preview", intent: publicIntent(intent), signUrl });
      }
      const result = await ctx.payments.confirm(user.userId, transferIntentId, confirmationToken);
      return data("Demo transaction confirmed and an audit receipt was created.", { view: "receipt", intent: publicIntent(result.intent), explorerUrl: result.explorerUrl });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "cancel_transfer", {
    title: "Cancel prepared transfer",
    description: "Use this when the user wants to cancel a transfer that has not completed.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: destructive, _meta: oauthMeta(false, "wallet:write")
  }, async ({ transferIntentId }, extra) => {
    try { const user = resolveUser(ctx, extra, "wallet:write"); return data("Transfer cancelled.", { view: "cancelled", intent: publicIntent(ctx.payments.cancel(user.userId, transferIntentId)) }); }
    catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "get_transaction_status", {
    title: "Get transaction status",
    description: "Use this when the user wants the current state of a prepared intent or submitted AiFinPay transaction.",
    inputSchema: { transactionHash: z.string().optional(), transferIntentId: z.string().optional() }, annotations: readOnly, _meta: oauthMeta()
  }, async ({ transactionHash, transferIntentId }, extra) => {
    try {
      const user = resolveUser(ctx, extra);
      const intent = transferIntentId ? ctx.payments.requireIntent(transferIntentId, user.userId) : transactionHash ? ctx.store.findIntentByHash(transactionHash, user.userId) : null;
      if (!intent) throw new AppError("WALLET_NOT_FOUND", "Transaction was not found.", 404);
      return data(`Transaction status: ${intent.status}.`, { view: "transaction-status", intent: publicIntent(intent) });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "list_transactions", {
    title: "List AiFinPay transactions",
    description: "Use this when the user wants recent AiFinPay transaction history or audit receipt identifiers.",
    inputSchema: { network: networkSchema.optional(), token: tokenSchema.optional(), initiatedBy: z.enum(["USER", "AGENT"]).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() }, annotations: readOnly, _meta: oauthMeta()
  }, async ({ network, token, initiatedBy, limit }, extra) => {
    try {
      const user = resolveUser(ctx, extra); let transactions = await ctx.adapter.listTransactions(user.userId);
      if (network) transactions = transactions.filter((item) => item.network === network);
      if (token) transactions = transactions.filter((item) => item.token === token);
      if (initiatedBy) transactions = transactions.filter((item) => item.initiatedByType === initiatedBy);
      return data("Transaction history loaded.", { view: "history", transactions: transactions.slice(0, limit), nextCursor: null });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "create_agent_policy", {
    title: "Create agent spending policy",
    description: "Use this when the user wants to preview or explicitly confirm a new spending policy for a named AI agent. Omit confirmation fields to receive a preview.",
    inputSchema: { ...policyDraftSchema, confirmationToken: z.string().optional(), confirmationExpiresAt: z.string().datetime().optional(), idempotencyKey: idempotencyKeySchema }, annotations: write,
    _meta: oauthMeta(true, "wallet:write")
  }, async (args, extra) => {
    try {
      const user = resolveUser(ctx, extra, "wallet:write");
      const { confirmationToken, confirmationExpiresAt, idempotencyKey: _idempotency, ...draft } = args;
      void _idempotency;
      if (!confirmationToken || !confirmationExpiresAt) {
        const preview = ctx.policies.previewToken(user.userId, draft);
        return data("Agent policy preview created. Explicit confirmation is required before saving.", { view: "policy-preview", draft, ...preview });
      }
      const policy = ctx.policies.create(user.userId, draft, confirmationToken, confirmationExpiresAt);
      return data("Agent spending policy saved.", { view: "policy", policy });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "list_agent_policies", {
    title: "List agent spending policies",
    description: "Use this when the user wants to review active or revoked AiFinPay agent spending limits.",
    inputSchema: {}, annotations: readOnly, _meta: oauthMeta()
  }, async (_args, extra) => { try { const user = resolveUser(ctx, extra); return data("Agent policies loaded.", { view: "policies", policies: ctx.store.listPolicies(user.userId) }); } catch (error) { return failure(error, ctx); } });

  registerAppTool(server, "update_agent_policy", {
    title: "Update agent policy status",
    description: "Use this only after the user explicitly confirms enabling or disabling an existing agent spending policy.",
    inputSchema: { policyId: z.string().min(8), enabled: z.boolean(), confirmation: z.literal(true) }, annotations: write, _meta: oauthMeta(false, "wallet:write")
  }, async ({ policyId, enabled }, extra) => { try { const user = resolveUser(ctx, extra, "wallet:write"); return data("Agent policy updated.", { view: "policy", policy: ctx.policies.update(user.userId, policyId, enabled) }); } catch (error) { return failure(error, ctx); } });

  registerAppTool(server, "revoke_agent_policy", {
    title: "Revoke agent policy",
    description: "Use this only after the user explicitly confirms revoking an existing agent spending policy.",
    inputSchema: { policyId: z.string().min(8), confirmation: z.literal(true) }, annotations: destructive, _meta: oauthMeta(false, "wallet:write")
  }, async ({ policyId }, extra) => { try { const user = resolveUser(ctx, extra, "wallet:write"); return data("Agent policy revoked.", { view: "policy", policy: ctx.policies.revoke(user.userId, policyId) }); } catch (error) { return failure(error, ctx); } });

  registerAppTool(server, "evaluate_payment_request", {
    title: "Evaluate agent payment request",
    description: "Use this when an agent requests a payment and AiFinPay must authoritatively decide whether it is auto-approved, needs human approval, or is blocked.",
    inputSchema: { ...prepareSchema, initiatedByAgentId: z.string().min(2).max(80), riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW") }, annotations: readOnly, _meta: oauthMeta()
  }, async (args, extra) => {
    try {
      const user = resolveUser(ctx, extra); const balance = await ctx.adapter.getBalance(user.userId, args.token, args.network);
      const decision = evaluatePolicy({ agentId: args.initiatedByAgentId, amount: args.amount, token: args.token, network: args.network,
        recipient: args.recipient, ...(args.merchantId ? { merchantId: args.merchantId } : {}), ...(args.merchantCategory ? { merchantCategory: args.merchantCategory } : {}),
        availableBalanceRaw: balance.raw, spentTodayRaw: "0", riskLevel: args.riskLevel, duplicate: false, now: new Date() }, ctx.store.listPolicies(user.userId));
      return data(`Policy decision: ${decision.decision}.`, { view: decision.decision === "BLOCKED" ? "blocked" : "agent-approval", decision });
    } catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "get_audit_log", {
    title: "Get AiFinPay audit log",
    description: "Use this when the user wants the tamper-evident audit trail for wallet, transfer, or policy actions.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(30) }, annotations: readOnly, _meta: oauthMeta()
  }, async ({ limit }, extra) => { try { const user = resolveUser(ctx, extra); const events = ctx.store.listAudit(user.userId, limit); return data("Audit log loaded.", { view: "audit", events, chainValid: ctx.audit.verify(events) }); } catch (error) { return failure(error, ctx); } });

  registerAppTool(server, "render_wallet", {
    title: "Render AiFinPay wallet",
    description: "Use this after wallet data is requested to render the interactive AiFinPay wallet widget inside ChatGPT.",
    inputSchema: { network: networkSchema.optional() }, annotations: readOnly, _meta: oauthMeta(true)
  }, async ({ network }, extra) => {
    try { const user = resolveUser(ctx, extra); const selectedNetwork = resolveNetwork(ctx, network); const summary = await ctx.adapter.getWalletSummary(user.userId, selectedNetwork); summary.activeAgentPolicies = ctx.store.listPolicies(user.userId).filter((p) => p.enabled); const connection = ctx.store.getWalletConnection(user.userId); return rendered(ctx.config.walletMode === "mainnet" ? "AiFinPay wallet opened. Live read-only balances across all 13 mainnet networks." : "AiFinPay wallet opened.", { view: "wallet", summary: { ...summary, address: undefined }, connection, networks: MAINNET_NETWORKS }); }
    catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "render_transfer_preview", {
    title: "Render transfer preview",
    description: "Use this after prepare_transfer succeeds to render the explicit confirmation UI for that prepared intent.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: readOnly, _meta: oauthMeta(true)
  }, async ({ transferIntentId }, extra) => {
    try { const user = resolveUser(ctx, extra); const intent = ctx.payments.requireIntent(transferIntentId, user.userId); return rendered("Transfer preview opened.", { view: intent.status === "BLOCKED" ? "blocked" : "transfer-preview", intent: publicIntent(intent), confirmationToken: ctx.payments.confirmationForIntent(intent, user.userId) }); }
    catch (error) { return failure(error, ctx); }
  });

  registerAppTool(server, "render_transaction_receipt", {
    title: "Render transaction receipt",
    description: "Use this after a transfer completes to render its transaction and audit receipt.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: readOnly, _meta: oauthMeta(true)
  }, async ({ transferIntentId }, extra) => {
    try { const user = resolveUser(ctx, extra); const intent = ctx.payments.requireIntent(transferIntentId, user.userId); return rendered("Transaction receipt opened.", { view: "receipt", intent: publicIntent(intent), explorerUrl: intent.transactionHash ? `https://amoy.polygonscan.com/tx/${intent.transactionHash}` : null }); }
    catch (error) { return failure(error, ctx); }
  });
}
