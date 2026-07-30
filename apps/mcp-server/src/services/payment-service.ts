import { createHash } from "node:crypto";
import { assertTransition, evaluatePolicy, type ExecutionResult, type WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS, formatBaseUnits, networkMeta, parseBaseUnits, paymentAssetSpec,
  type LiveNetworkSpec, type NetworkId, type PaymentIntent, type RiskLevel, type TokenSymbol
} from "@aifinpay/shared";
import type { AuditService } from "../audit/audit-service.js";
import type { Store } from "../storage/store.js";
import type { ConfirmationService } from "./confirmation-service.js";

export interface PrepareTransferInput {
  recipient: string;
  amount: string;
  token: TokenSymbol;
  network: NetworkId;
  memo?: string;
  initiatedByAgentId?: string;
  merchantId?: string;
  merchantCategory?: string;
  purpose?: string;
  idempotencyKey: string;
}

function validatedRecipient(network: NetworkId, value: string): string {
  if (network === "POLYGON_AMOY") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new AppError("INVALID_ADDRESS", "Expected a valid EVM recipient address.");
    return value.toLowerCase();
  }
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new AppError("NETWORK_UNSUPPORTED", `${network} is not supported.`);
  if (spec.family === "EVM") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new AppError("INVALID_ADDRESS", "Expected a valid EVM recipient address.");
    return value.toLowerCase();
  }
  if (spec.family === "SOLANA") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) throw new AppError("INVALID_ADDRESS", "Expected a valid Solana recipient address.");
    return value;
  }
  throw new AppError("SIGNING_FAILED", `Direct sending on ${spec.label} is not implemented yet.`, 501);
}

export class PaymentService {
  constructor(
    private readonly store: Store,
    private readonly audit: AuditService,
    private readonly confirmations: ConfirmationService,
    private readonly adapter: WalletAdapter
  ) {}

  private digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

  async prepare(userId: string, input: PrepareTransferInput): Promise<{ intent: PaymentIntent; confirmationToken?: string; policyExplanation: string }> {
    const requestHash = this.digest(input);
    const existing = this.store.getIntentByIdempotency(userId, input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AppError("DUPLICATE_REQUEST", "This idempotency key was already used for a different request.");
      const response: { intent: PaymentIntent; confirmationToken?: string; policyExplanation: string } = { intent: existing.intent, policyExplanation: "Returned the existing idempotent payment intent." };
      if (existing.intent.status === "REQUIRES_CONFIRMATION" || existing.intent.status === "AUTO_APPROVED") {
        response.confirmationToken = this.confirmations.issue(existing.intent.id, userId, existing.intent.expiresAt);
      }
      return response;
    }

    const recipient = validatedRecipient(input.network, input.recipient);
    const asset = paymentAssetSpec(input.network, input.token);
    if (!asset) throw new AppError("TOKEN_UNSUPPORTED", `${input.token} is not available on ${input.network}.`);
    const amountBaseUnits = parseBaseUnits(input.amount, asset.decimals);
    const balance = await this.adapter.getBalance(userId, input.token, input.network);
    const policies = this.store.listPolicies(userId);
    const riskLevel: RiskLevel = input.memo?.toLowerCase().includes("bypass") ? "HIGH" : "LOW";
    const spentTodayRaw = input.initiatedByAgentId
      ? this.store.sumSpentTodayRaw(userId, input.initiatedByAgentId, input.token, input.network)
      : "0";
    const policy = evaluatePolicy({
      ...(input.initiatedByAgentId ? { agentId: input.initiatedByAgentId } : {}),
      amount: input.amount, token: input.token, network: input.network, recipient,
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.merchantCategory ? { merchantCategory: input.merchantCategory } : {}),
      availableBalanceRaw: balance.raw, spentTodayRaw, riskLevel, duplicate: false, now: new Date()
    }, policies);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const id = `pi_${this.digest(`${userId}:${input.idempotencyKey}`).slice(0, 20)}`;
    const auditReceiptId = `receipt_${this.digest(`receipt:${id}`).slice(0, 20)}`;
    const status = policy.decision === "BLOCKED" ? "BLOCKED" : policy.decision === "AUTO_APPROVED" ? "AUTO_APPROVED" : "REQUIRES_CONFIRMATION";
    const intent: PaymentIntent = {
      id, ownerUserId: userId, walletId: `wallet_${this.digest(userId).slice(0, 20)}`,
      initiatedByType: input.initiatedByAgentId ? "AGENT" : "USER",
      initiatedById: input.initiatedByAgentId ?? userId,
      recipient,
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.merchantCategory ? { merchantCategory: input.merchantCategory } : {}),
      ...(input.purpose || input.memo ? { purpose: input.purpose ?? input.memo } : {}),
      token: input.token, tokenAddress: asset.address, amount: formatBaseUnits(amountBaseUnits, asset.decimals),
      amountBaseUnits: amountBaseUnits.toString(), network: input.network, chainId: networkMeta(input.network).chainId,
      estimatedFee: `Calculated at signing in ${asset.symbol === "USDC" ? paymentAssetSpec(input.network, "POL")?.symbol ?? "native token" : asset.symbol}`,
      status, policyDecision: policy.decision, policyReasonCodes: policy.reasonCodes,
      riskLevel, createdAt: now.toISOString(), expiresAt, idempotencyKey: input.idempotencyKey, auditReceiptId
    };
    this.store.saveIntent(intent, requestHash);
    this.audit.record({ userId, agentId: input.initiatedByAgentId ?? null, action: "PREPARE_TRANSFER", entityType: "PaymentIntent", entityId: id,
      decision: policy.decision, reasonCode: policy.reasonCodes.join(","), metadata: { token: input.token, network: input.network, amountBaseUnits: amountBaseUnits.toString() } });
    const response: { intent: PaymentIntent; confirmationToken?: string; policyExplanation: string } = { intent, policyExplanation: policy.explanation };
    if (status !== "BLOCKED") response.confirmationToken = this.confirmations.issue(id, userId, expiresAt);
    return response;
  }

  async confirm(userId: string, intentId: string, confirmationToken: string): Promise<{ intent: PaymentIntent; explorerUrl: string }> {
    const intent = this.requireIntent(intentId, userId);
    if (!this.confirmations.verify(confirmationToken, intent.id, userId, intent.expiresAt)) throw new AppError("CONFIRMATION_REQUIRED", "A valid explicit confirmation token is required.");
    if (intent.status === "COMPLETED" && intent.transactionHash) {
      return { intent, explorerUrl: `${networkMeta(intent.network).explorerBaseUrl}/tx/${intent.transactionHash}` };
    }
    if (intent.status === "BLOCKED") throw new AppError("POLICY_BLOCKED", "Blocked payment intents cannot be confirmed.");
    if (new Date(intent.expiresAt) <= new Date()) {
      this.transition(intent, "EXPIRED");
      throw new AppError("INTENT_EXPIRED", "The transfer preview expired. Prepare it again.");
    }
    if (intent.status !== "REQUIRES_CONFIRMATION" && intent.status !== "AUTO_APPROVED") throw new AppError("CONFIRMATION_REQUIRED", `Cannot confirm an intent in ${intent.status} state.`);
    this.transition(intent, "CONFIRMED");
    intent.confirmedAt = new Date().toISOString();
    this.transition(intent, "SIGNING");
    const execution = await this.adapter.execute(intent);
    this.transition(intent, "SUBMITTED");
    intent.submittedAt = new Date().toISOString();
    intent.transactionHash = execution.transactionHash;
    this.transition(intent, execution.status === "CONFIRMED" ? "COMPLETED" : execution.status === "PENDING" ? "PENDING" : "FAILED");
    this.store.saveIntent(intent, this.digest({ idempotencyKey: intent.idempotencyKey }));
    this.audit.record({ userId, agentId: intent.initiatedByType === "AGENT" ? intent.initiatedById : null, action: "CONFIRM_TRANSFER",
      entityType: "PaymentIntent", entityId: intent.id, decision: intent.status, reasonCode: intent.policyReasonCodes.join(","),
      metadata: { transactionHash: execution.transactionHash, amountBaseUnits: intent.amountBaseUnits } });
    return { intent, explorerUrl: execution.explorerUrl };
  }

  intentForSigning(userId: string, intentId: string): PaymentIntent {
    const intent = this.requireIntent(intentId, userId);
    if (intent.status === "BLOCKED") throw new AppError("POLICY_BLOCKED", "This payment was blocked by policy and cannot be signed.");
    if (intent.transactionHash || ["SUBMITTED", "PENDING", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(intent.status)) {
      throw new AppError("DUPLICATE_REQUEST", "This payment has already been submitted.");
    }
    if (new Date(intent.expiresAt) <= new Date()) {
      if (intent.status === "REQUIRES_CONFIRMATION" || intent.status === "AUTO_APPROVED" || intent.status === "CONFIRMED") this.transition(intent, "EXPIRED");
      throw new AppError("INTENT_EXPIRED", "The transfer preview expired. Prepare it again.");
    }
    return intent;
  }

  finalizeVaultBroadcast(userId: string, intentId: string, execution: ExecutionResult): { intent: PaymentIntent; explorerUrl: string } {
    const intent = this.requireIntent(intentId, userId);
    const forward: PaymentIntent["status"][] =
      intent.status === "REQUIRES_CONFIRMATION" || intent.status === "AUTO_APPROVED" ? ["CONFIRMED", "SIGNING", "SUBMITTED"]
      : intent.status === "CONFIRMED" ? ["SIGNING", "SUBMITTED"]
      : intent.status === "SIGNING" ? ["SUBMITTED"]
      : [];
    for (const next of forward) this.transition(intent, next);
    if (!intent.confirmedAt) intent.confirmedAt = new Date().toISOString();
    intent.submittedAt = new Date().toISOString();
    intent.transactionHash = execution.transactionHash;
    this.transition(intent, execution.status === "CONFIRMED" ? "COMPLETED" : execution.status === "FAILED" ? "FAILED" : "PENDING");
    this.store.saveIntent(intent, this.digest({ idempotencyKey: intent.idempotencyKey }));
    this.audit.record({ userId, agentId: intent.initiatedByType === "AGENT" ? intent.initiatedById : null, action: "VAULT_BROADCAST",
      entityType: "PaymentIntent", entityId: intent.id, decision: intent.status, reasonCode: intent.policyReasonCodes.join(","),
      metadata: { transactionHash: execution.transactionHash, amountBaseUnits: intent.amountBaseUnits, network: intent.network } });
    return { intent, explorerUrl: execution.explorerUrl };
  }

  cancel(userId: string, intentId: string): PaymentIntent {
    const intent = this.requireIntent(intentId, userId);
    if (!["REQUIRES_CONFIRMATION", "AUTO_APPROVED", "CONFIRMED"].includes(intent.status)) throw new AppError("CONFIRMATION_REQUIRED", `Cannot cancel an intent in ${intent.status} state.`);
    this.transition(intent, "CANCELLED");
    this.store.saveIntent(intent, this.digest({ idempotencyKey: intent.idempotencyKey }));
    this.audit.record({ userId, agentId: null, action: "CANCEL_TRANSFER", entityType: "PaymentIntent", entityId: intent.id,
      decision: "CANCELLED", reasonCode: "USER_CONFIRMATION_REQUIRED" });
    return intent;
  }

  requireIntent(intentId: string, userId: string): PaymentIntent {
    const intent = this.store.getIntent(intentId, userId);
    if (!intent) throw new AppError("WALLET_NOT_FOUND", "Payment intent not found.", 404);
    return intent;
  }

  confirmationForIntent(intent: PaymentIntent, userId: string): string {
    if (intent.ownerUserId !== userId) throw new AppError("AUTH_REQUIRED", "This payment intent belongs to another user.", 403);
    return this.confirmations.issue(intent.id, userId, intent.expiresAt);
  }

  private transition(intent: PaymentIntent, next: PaymentIntent["status"]): void {
    assertTransition(intent.status, next);
    intent.status = next;
  }
}
