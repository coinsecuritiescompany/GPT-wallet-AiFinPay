import { createHash } from "node:crypto";
import { assertTransition, evaluatePolicy, type WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, DEMO_WALLET_ID, TOKENS, formatBaseUnits, networkMeta, parseBaseUnits,
  type NetworkId, type PaymentIntent, type RiskLevel, type TokenSymbol
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

    const token = TOKENS[input.token];
    const amountBaseUnits = parseBaseUnits(input.amount, token.decimals);
    const balance = await this.adapter.getBalance(userId, input.token, input.network);
    const policies = this.store.listPolicies(userId);
    const riskLevel: RiskLevel = input.memo?.toLowerCase().includes("bypass") ? "HIGH" : "LOW";
    const policy = evaluatePolicy({
      ...(input.initiatedByAgentId ? { agentId: input.initiatedByAgentId } : {}),
      amount: input.amount, token: input.token, network: input.network, recipient: input.recipient,
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.merchantCategory ? { merchantCategory: input.merchantCategory } : {}),
      availableBalanceRaw: balance.raw, spentTodayRaw: "0", riskLevel, duplicate: false, now: new Date()
    }, policies);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
    const id = `pi_${this.digest(`${userId}:${input.idempotencyKey}`).slice(0, 20)}`;
    const auditReceiptId = `receipt_${this.digest(`receipt:${id}`).slice(0, 20)}`;
    const status = policy.decision === "BLOCKED" ? "BLOCKED" : policy.decision === "AUTO_APPROVED" ? "AUTO_APPROVED" : "REQUIRES_CONFIRMATION";
    const intent: PaymentIntent = {
      id, ownerUserId: userId, walletId: DEMO_WALLET_ID,
      initiatedByType: input.initiatedByAgentId ? "AGENT" : "USER",
      initiatedById: input.initiatedByAgentId ?? userId,
      recipient: input.recipient.toLowerCase(),
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.merchantCategory ? { merchantCategory: input.merchantCategory } : {}),
      ...(input.purpose || input.memo ? { purpose: input.purpose ?? input.memo } : {}),
      token: input.token, tokenAddress: token.address, amount: formatBaseUnits(amountBaseUnits, token.decimals),
      amountBaseUnits: amountBaseUnits.toString(), network: input.network, chainId: networkMeta(input.network).chainId,
      estimatedFee: "0.0012 POL", status, policyDecision: policy.decision, policyReasonCodes: policy.reasonCodes,
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
