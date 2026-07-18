import { describe, expect, it } from "vitest";
import type { AgentPolicy } from "@aifinpay/shared";
import { evaluatePolicy } from "./policy-engine.js";

const DEMO_POLICY: AgentPolicy = {
  policyId: "p", ownerUserId: "u", agentId: "research-agent", name: "Research", enabled: true,
  dailyLimit: "5", perTransactionLimit: "0.50", tokenAllowlist: ["USDC"], networkAllowlist: ["POLYGON_AMOY"],
  allowedRecipients: ["0x2222222222222222222222222222222222222222"], allowedMerchantCategories: ["API_PROVIDER"],
  merchantAllowlist: ["demo-data-api"], approvalThreshold: "0.10", validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z"
};

const base = {
  agentId: "research-agent", amount: "0.10", token: "USDC" as const, network: "POLYGON_AMOY" as const,
  recipient: "0x2222222222222222222222222222222222222222", merchantId: "demo-data-api",
  merchantCategory: "API_PROVIDER", availableBalanceRaw: "2543680000", spentTodayRaw: "0", riskLevel: "LOW" as const,
  duplicate: false, now: new Date("2026-07-18T08:00:00.000Z")
};

describe("deterministic policy engine", () => {
  it("auto-approves a request inside policy", () => expect(evaluatePolicy(base, [DEMO_POLICY]).decision).toBe("AUTO_APPROVED"));
  it("requires a human above the approval threshold", () => expect(evaluatePolicy({ ...base, amount: "0.25" }, [DEMO_POLICY]).decision).toBe("HUMAN_APPROVAL_REQUIRED"));
  it("blocks a request over the per-transaction limit", () => expect(evaluatePolicy({ ...base, amount: "0.51" }, [DEMO_POLICY]).reasonCodes).toContain("PER_TRANSACTION_LIMIT_EXCEEDED"));
  it("blocks an unapproved merchant", () => expect(evaluatePolicy({ ...base, merchantId: "unknown" }, [DEMO_POLICY]).reasonCodes).toContain("MERCHANT_NOT_ALLOWED"));
  it("blocks a high-risk request", () => expect(evaluatePolicy({ ...base, riskLevel: "HIGH" }, [DEMO_POLICY]).decision).toBe("BLOCKED"));
  it("always requires confirmation for a human transfer", () => expect(evaluatePolicy({ ...base, agentId: undefined }, [DEMO_POLICY]).reasonCodes).toContain("USER_CONFIRMATION_REQUIRED"));
});
