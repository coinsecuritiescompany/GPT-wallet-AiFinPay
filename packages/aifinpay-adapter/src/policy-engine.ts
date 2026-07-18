import { parseBaseUnits, TOKENS, type AgentPolicy, type NetworkId, type PolicyDecision, type PolicyReasonCode, type TokenSymbol } from "@aifinpay/shared";

export interface PolicyContext {
  agentId?: string;
  amount: string;
  token: TokenSymbol;
  network: NetworkId;
  recipient: string;
  merchantId?: string;
  merchantCategory?: string;
  availableBalanceRaw: string;
  spentTodayRaw: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  duplicate: boolean;
  now: Date;
}

export interface PolicyResult {
  decision: PolicyDecision;
  reasonCodes: PolicyReasonCode[];
  explanation: string;
  policyId?: string;
}

function blocked(code: PolicyReasonCode, explanation: string, policy?: AgentPolicy): PolicyResult {
  return { decision: "BLOCKED", reasonCodes: [code], explanation, ...(policy ? { policyId: policy.policyId } : {}) };
}

export function evaluatePolicy(context: PolicyContext, policies: AgentPolicy[]): PolicyResult {
  const decimals = TOKENS[context.token].decimals;
  const amount = parseBaseUnits(context.amount, decimals);
  if (context.duplicate) return blocked("DUPLICATE_REQUEST", "This payment request was already prepared.");
  if (context.riskLevel === "HIGH") return blocked("HIGH_RISK_REQUEST", "The request was flagged as high risk.");
  if (amount > BigInt(context.availableBalanceRaw)) return blocked("INSUFFICIENT_BALANCE", "The wallet balance is insufficient.");

  if (!context.agentId) {
    return { decision: "HUMAN_APPROVAL_REQUIRED", reasonCodes: ["USER_CONFIRMATION_REQUIRED"], explanation: "The wallet owner must confirm this transfer." };
  }

  const policy = policies.find((candidate) => candidate.agentId === context.agentId);
  if (!policy || !policy.enabled) return blocked("POLICY_DISABLED", "No enabled spending policy exists for this agent.", policy);
  if (context.now < new Date(policy.validFrom) || context.now > new Date(policy.validUntil)) return blocked("POLICY_EXPIRED", "The agent policy is outside its validity period.", policy);
  if (!policy.tokenAllowlist.includes(context.token)) return blocked("TOKEN_NOT_ALLOWED", `${context.token} is not allowed by the agent policy.`, policy);
  if (!policy.networkAllowlist.includes(context.network)) return blocked("NETWORK_NOT_ALLOWED", `${context.network} is not allowed by the agent policy.`, policy);
  if (policy.allowedRecipients.length && !policy.allowedRecipients.map((v) => v.toLowerCase()).includes(context.recipient.toLowerCase())) {
    return blocked("RECIPIENT_NOT_ALLOWED", "The destination is not on the policy allowlist.", policy);
  }
  if (policy.merchantAllowlist.length && (!context.merchantId || !policy.merchantAllowlist.includes(context.merchantId))) {
    return blocked("MERCHANT_NOT_ALLOWED", "The merchant is not on the policy allowlist.", policy);
  }
  if (policy.allowedMerchantCategories.length && (!context.merchantCategory || !policy.allowedMerchantCategories.includes(context.merchantCategory))) {
    return blocked("MERCHANT_NOT_ALLOWED", "The merchant category is not allowed.", policy);
  }

  const perTransaction = parseBaseUnits(policy.perTransactionLimit, decimals);
  const daily = parseBaseUnits(policy.dailyLimit, decimals);
  const threshold = parseBaseUnits(policy.approvalThreshold, decimals);
  if (amount > perTransaction) return blocked("PER_TRANSACTION_LIMIT_EXCEEDED", "The payment exceeds the per-transaction limit.", policy);
  if (BigInt(context.spentTodayRaw) + amount > daily) return blocked("DAILY_LIMIT_EXCEEDED", "The payment would exceed the daily limit.", policy);
  if (amount > threshold) {
    return { decision: "HUMAN_APPROVAL_REQUIRED", reasonCodes: ["APPROVAL_THRESHOLD_EXCEEDED"], explanation: "The amount is allowed but exceeds the automatic approval threshold.", policyId: policy.policyId };
  }
  return { decision: "AUTO_APPROVED", reasonCodes: ["ALLOWED_WITHIN_POLICY"], explanation: "The request is within the active agent policy.", policyId: policy.policyId };
}

