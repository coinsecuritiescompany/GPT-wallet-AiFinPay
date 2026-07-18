import { createHash } from "node:crypto";
import { AppError, type AgentPolicy, type NetworkId, type TokenSymbol } from "@aifinpay/shared";
import type { AuditService } from "../audit/audit-service.js";
import type { Store } from "../storage/store.js";
import type { ConfirmationService } from "./confirmation-service.js";

export interface PolicyDraft {
  agentId: string; name: string; dailyLimit: string; perTransactionLimit: string;
  tokenAllowlist: TokenSymbol[]; networkAllowlist: NetworkId[]; allowedRecipients: string[];
  allowedMerchantCategories: string[]; merchantAllowlist: string[]; approvalThreshold: string; validUntil: string;
}

export class PolicyService {
  constructor(private readonly store: Store, private readonly audit: AuditService, private readonly confirmations: ConfirmationService) {}
  private hash(v: unknown): string { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }

  previewToken(userId: string, draft: PolicyDraft): { subject: string; expiresAt: string; confirmationToken: string } {
    const subject = `policy:${this.hash(draft)}`;
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    return { subject, expiresAt, confirmationToken: this.confirmations.issue(subject, userId, expiresAt) };
  }

  create(userId: string, draft: PolicyDraft, token: string, expiresAt: string): AgentPolicy {
    const subject = `policy:${this.hash(draft)}`;
    if (new Date(expiresAt) <= new Date() || !this.confirmations.verify(token, subject, userId, expiresAt)) throw new AppError("CONFIRMATION_REQUIRED", "A valid explicit policy confirmation is required.");
    const now = new Date().toISOString();
    const policy: AgentPolicy = {
      policyId: `policy_${this.hash(`${userId}:${draft.agentId}:${draft.name}`).slice(0, 18)}`,
      ownerUserId: userId, agentId: draft.agentId, name: draft.name, enabled: true,
      dailyLimit: draft.dailyLimit, perTransactionLimit: draft.perTransactionLimit, tokenAllowlist: draft.tokenAllowlist,
      networkAllowlist: draft.networkAllowlist, allowedRecipients: draft.allowedRecipients.map((v) => v.toLowerCase()),
      allowedMerchantCategories: draft.allowedMerchantCategories, merchantAllowlist: draft.merchantAllowlist,
      approvalThreshold: draft.approvalThreshold, validFrom: now, validUntil: draft.validUntil, createdAt: now, updatedAt: now
    };
    this.store.savePolicy(policy);
    this.audit.record({ userId, agentId: policy.agentId, action: "CREATE_AGENT_POLICY", entityType: "AgentPolicy", entityId: policy.policyId,
      decision: "CONFIRMED", reasonCode: "USER_CONFIRMATION_REQUIRED" });
    return policy;
  }

  update(userId: string, policyId: string, enabled: boolean): AgentPolicy {
    const policy = this.store.getPolicy(policyId, userId);
    if (!policy) throw new AppError("WALLET_NOT_FOUND", "Agent policy not found.", 404);
    policy.enabled = enabled; policy.updatedAt = new Date().toISOString(); this.store.savePolicy(policy);
    this.audit.record({ userId, agentId: policy.agentId, action: "UPDATE_AGENT_POLICY", entityType: "AgentPolicy", entityId: policy.policyId,
      decision: enabled ? "ENABLED" : "DISABLED", reasonCode: "USER_CONFIRMATION_REQUIRED" });
    return policy;
  }

  revoke(userId: string, policyId: string): AgentPolicy { return this.update(userId, policyId, false); }
}
