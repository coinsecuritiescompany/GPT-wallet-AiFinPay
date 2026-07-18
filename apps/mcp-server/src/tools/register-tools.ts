import { evaluatePolicy } from "@aifinpay/aifinpay-adapter";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  AppError, decimalAmountSchema, evmAddressSchema, idempotencyKeySchema, networkSchema, safeError, tokenSchema,
  type PaymentIntent
} from "@aifinpay/shared";
import type { AppContext } from "../context.js";

export const WIDGET_URI = "ui://aifinpay/wallet-v1.html";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const destructive = { readOnlyHint: false, destructiveHint: true, openWorldHint: true, idempotentHint: true };

function data(message: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: message }], structuredContent };
}

function rendered(message: string, structuredContent: Record<string, unknown>) {
  return { ...data(message, structuredContent), _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI } };
}

function failure(error: unknown) {
  const safe = safeError(error);
  return { isError: true, ...data(safe.message, { view: "error", error: safe }) };
}

function publicIntent(intent: PaymentIntent) {
  const safe = { ...intent } as Partial<PaymentIntent>;
  delete safe.ownerUserId;
  delete safe.walletId;
  return safe;
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
  registerAppTool(server, "get_wallet_summary", {
    title: "Get AiFinPay wallet summary",
    description: "Use this when the user wants to view their AiFinPay wallet balance, network, recent transaction activity, and active agent limits.",
    inputSchema: { network: networkSchema.optional() }, annotations: readOnly, _meta: {}
  }, async ({ network }) => {
    try {
      const user = ctx.auth.resolve();
      const summary = await ctx.adapter.getWalletSummary(user.userId, network);
      summary.activeAgentPolicies = ctx.store.listPolicies(user.userId).filter((policy) => policy.enabled);
      return data("AiFinPay wallet summary loaded.", { view: "wallet", summary: { ...summary, address: undefined } });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "get_token_balance", {
    title: "Get token balance",
    description: "Use this when the user asks for the balance of a supported token in their AiFinPay wallet.",
    inputSchema: { token: tokenSchema, network: networkSchema }, annotations: readOnly, _meta: {}
  }, async ({ token, network }) => {
    try { const user = ctx.auth.resolve(); return data(`${token} balance loaded.`, { view: "balance", balance: await ctx.adapter.getBalance(user.userId, token, network) }); }
    catch (error) { return failure(error); }
  });

  registerAppTool(server, "prepare_transfer", {
    title: "Prepare wallet transfer",
    description: "Use this when the user has expressed a specific blockchain transfer request and needs a validated preview before confirmation. This never broadcasts a transaction.",
    inputSchema: prepareSchema, annotations: write, _meta: {}
  }, async (args) => {
    try {
      const user = ctx.auth.resolve();
      const result = await ctx.payments.prepare(user.userId, args);
      return data(result.intent.status === "BLOCKED" ? "Blocked by AiFinPay Policy Engine." : "Transfer prepared. Explicit confirmation is required before execution.", {
        view: result.intent.status === "BLOCKED" ? "blocked" : "transfer-preview",
        intent: publicIntent(result.intent), confirmationToken: result.confirmationToken, policyExplanation: result.policyExplanation
      });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "confirm_transfer", {
    title: "Confirm prepared transfer",
    description: "Use this only after the user has explicitly confirmed a previously prepared transfer. A valid prepared intent and confirmation token are mandatory.",
    inputSchema: { transferIntentId: z.string().min(8), confirmationToken: z.string().min(20), idempotencyKey: idempotencyKeySchema }, annotations: destructive, _meta: {}
  }, async ({ transferIntentId, confirmationToken }) => {
    try {
      const user = ctx.auth.resolve(); const result = await ctx.payments.confirm(user.userId, transferIntentId, confirmationToken);
      return data("Demo transaction confirmed and an audit receipt was created.", { view: "receipt", intent: publicIntent(result.intent), explorerUrl: result.explorerUrl });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "cancel_transfer", {
    title: "Cancel prepared transfer",
    description: "Use this when the user wants to cancel a transfer that has not completed.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: write, _meta: {}
  }, async ({ transferIntentId }) => {
    try { const user = ctx.auth.resolve(); return data("Transfer cancelled.", { view: "cancelled", intent: publicIntent(ctx.payments.cancel(user.userId, transferIntentId)) }); }
    catch (error) { return failure(error); }
  });

  registerAppTool(server, "get_transaction_status", {
    title: "Get transaction status",
    description: "Use this when the user wants the current state of a prepared intent or submitted AiFinPay transaction.",
    inputSchema: { transactionHash: z.string().optional(), transferIntentId: z.string().optional() }, annotations: readOnly, _meta: {}
  }, async ({ transactionHash, transferIntentId }) => {
    try {
      const user = ctx.auth.resolve();
      const intent = transferIntentId ? ctx.payments.requireIntent(transferIntentId, user.userId) : transactionHash ? ctx.store.findIntentByHash(transactionHash, user.userId) : null;
      if (!intent) throw new AppError("WALLET_NOT_FOUND", "Transaction was not found.", 404);
      return data(`Transaction status: ${intent.status}.`, { view: "transaction-status", intent: publicIntent(intent) });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "list_transactions", {
    title: "List AiFinPay transactions",
    description: "Use this when the user wants recent AiFinPay transaction history or audit receipt identifiers.",
    inputSchema: { network: networkSchema.optional(), token: tokenSchema.optional(), initiatedBy: z.enum(["USER", "AGENT"]).optional(), limit: z.number().int().min(1).max(50).default(20), cursor: z.string().optional() }, annotations: readOnly, _meta: {}
  }, async ({ network, token, initiatedBy, limit }) => {
    try {
      const user = ctx.auth.resolve(); let transactions = await ctx.adapter.listTransactions(user.userId);
      if (network) transactions = transactions.filter((item) => item.network === network);
      if (token) transactions = transactions.filter((item) => item.token === token);
      if (initiatedBy) transactions = transactions.filter((item) => item.initiatedByType === initiatedBy);
      return data("Transaction history loaded.", { view: "history", transactions: transactions.slice(0, limit), nextCursor: null });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "create_agent_policy", {
    title: "Create agent spending policy",
    description: "Use this when the user wants to preview or explicitly confirm a new spending policy for a named AI agent. Omit confirmation fields to receive a preview.",
    inputSchema: { ...policyDraftSchema, confirmationToken: z.string().optional(), confirmationExpiresAt: z.string().datetime().optional(), idempotencyKey: idempotencyKeySchema }, annotations: write,
    _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI }
  }, async (args) => {
    try {
      const user = ctx.auth.resolve();
      const { confirmationToken, confirmationExpiresAt, idempotencyKey: _idempotency, ...draft } = args;
      void _idempotency;
      if (!confirmationToken || !confirmationExpiresAt) {
        const preview = ctx.policies.previewToken(user.userId, draft);
        return data("Agent policy preview created. Explicit confirmation is required before saving.", { view: "policy-preview", draft, ...preview });
      }
      const policy = ctx.policies.create(user.userId, draft, confirmationToken, confirmationExpiresAt);
      return data("Agent spending policy saved.", { view: "policy", policy });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "list_agent_policies", {
    title: "List agent spending policies",
    description: "Use this when the user wants to review active or revoked AiFinPay agent spending limits.",
    inputSchema: {}, annotations: readOnly, _meta: {}
  }, async () => { try { const user = ctx.auth.resolve(); return data("Agent policies loaded.", { view: "policies", policies: ctx.store.listPolicies(user.userId) }); } catch (error) { return failure(error); } });

  registerAppTool(server, "update_agent_policy", {
    title: "Update agent policy status",
    description: "Use this only after the user explicitly confirms enabling or disabling an existing agent spending policy.",
    inputSchema: { policyId: z.string().min(8), enabled: z.boolean(), confirmation: z.literal(true) }, annotations: write, _meta: {}
  }, async ({ policyId, enabled }) => { try { const user = ctx.auth.resolve(); return data("Agent policy updated.", { view: "policy", policy: ctx.policies.update(user.userId, policyId, enabled) }); } catch (error) { return failure(error); } });

  registerAppTool(server, "revoke_agent_policy", {
    title: "Revoke agent policy",
    description: "Use this only after the user explicitly confirms revoking an existing agent spending policy.",
    inputSchema: { policyId: z.string().min(8), confirmation: z.literal(true) }, annotations: write, _meta: {}
  }, async ({ policyId }) => { try { const user = ctx.auth.resolve(); return data("Agent policy revoked.", { view: "policy", policy: ctx.policies.revoke(user.userId, policyId) }); } catch (error) { return failure(error); } });

  registerAppTool(server, "evaluate_payment_request", {
    title: "Evaluate agent payment request",
    description: "Use this when an agent requests a payment and AiFinPay must authoritatively decide whether it is auto-approved, needs human approval, or is blocked.",
    inputSchema: { ...prepareSchema, initiatedByAgentId: z.string().min(2).max(80), riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("LOW") }, annotations: readOnly, _meta: {}
  }, async (args) => {
    try {
      const user = ctx.auth.resolve(); const balance = await ctx.adapter.getBalance(user.userId, args.token, args.network);
      const decision = evaluatePolicy({ agentId: args.initiatedByAgentId, amount: args.amount, token: args.token, network: args.network,
        recipient: args.recipient, ...(args.merchantId ? { merchantId: args.merchantId } : {}), ...(args.merchantCategory ? { merchantCategory: args.merchantCategory } : {}),
        availableBalanceRaw: balance.raw, spentTodayRaw: "0", riskLevel: args.riskLevel, duplicate: false, now: new Date() }, ctx.store.listPolicies(user.userId));
      return data(`Policy decision: ${decision.decision}.`, { view: decision.decision === "BLOCKED" ? "blocked" : "agent-approval", decision });
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, "get_audit_log", {
    title: "Get AiFinPay audit log",
    description: "Use this when the user wants the tamper-evident audit trail for wallet, transfer, or policy actions.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(30) }, annotations: readOnly, _meta: {}
  }, async ({ limit }) => { try { const user = ctx.auth.resolve(); const events = ctx.store.listAudit(user.userId, limit); return data("Audit log loaded.", { view: "audit", events, chainValid: ctx.audit.verify(events) }); } catch (error) { return failure(error); } });

  registerAppTool(server, "render_wallet", {
    title: "Render AiFinPay wallet",
    description: "Use this after wallet data is requested to render the interactive AiFinPay wallet widget inside ChatGPT.",
    inputSchema: { network: networkSchema.optional() }, annotations: readOnly, _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI }
  }, async ({ network }) => {
    try { const user = ctx.auth.resolve(); const summary = await ctx.adapter.getWalletSummary(user.userId, network); summary.activeAgentPolicies = ctx.store.listPolicies(user.userId).filter((p) => p.enabled); return rendered("AiFinPay wallet opened.", { view: "wallet", summary: { ...summary, address: undefined } }); }
    catch (error) { return failure(error); }
  });

  registerAppTool(server, "render_transfer_preview", {
    title: "Render transfer preview",
    description: "Use this after prepare_transfer succeeds to render the explicit confirmation UI for that prepared intent.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: readOnly, _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI }
  }, async ({ transferIntentId }) => {
    try { const user = ctx.auth.resolve(); const intent = ctx.payments.requireIntent(transferIntentId, user.userId); return rendered("Transfer preview opened.", { view: intent.status === "BLOCKED" ? "blocked" : "transfer-preview", intent: publicIntent(intent), confirmationToken: ctx.payments.confirmationForIntent(intent, user.userId) }); }
    catch (error) { return failure(error); }
  });

  registerAppTool(server, "render_transaction_receipt", {
    title: "Render transaction receipt",
    description: "Use this after a transfer completes to render its transaction and audit receipt.",
    inputSchema: { transferIntentId: z.string().min(8) }, annotations: readOnly, _meta: { ui: { resourceUri: WIDGET_URI }, "openai/outputTemplate": WIDGET_URI }
  }, async ({ transferIntentId }) => {
    try { const user = ctx.auth.resolve(); const intent = ctx.payments.requireIntent(transferIntentId, user.userId); return rendered("Transaction receipt opened.", { view: "receipt", intent: publicIntent(intent), explorerUrl: intent.transactionHash ? `https://amoy.polygonscan.com/tx/${intent.transactionHash}` : null }); }
    catch (error) { return failure(error); }
  });
}
