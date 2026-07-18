import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppContext } from "../src/context.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = { port: 0, demoMode: true, databaseUrl: ":memory:", sessionSecret: "test-session-secret-at-least-thirty-two-chars", publicUrl: "http://localhost/mcp", widgetDomain: "http://localhost", logLevel: "silent", walletMode: "demo", polygonRpcUrls: ["https://polygon.example"] };
const base = { recipient: "0x2222222222222222222222222222222222222222", amount: "10", token: "USDC" as const, network: "POLYGON_AMOY" as const, idempotencyKey: "payment-test-001" };

describe("payment service integration and security", () => {
  let ctx: AppContext;
  beforeEach(() => { ctx = new AppContext(config); });
  afterEach(() => ctx.close());

  it("prepares, explicitly confirms, executes and returns an audit receipt", async () => {
    const prepared = await ctx.payments.prepare("demo-user-001", base);
    expect(prepared.intent.status).toBe("REQUIRES_CONFIRMATION");
    expect(prepared.confirmationToken).toBeTruthy();
    const completed = await ctx.payments.confirm("demo-user-001", prepared.intent.id, prepared.confirmationToken!);
    expect(completed.intent.status).toBe("COMPLETED");
    expect(completed.intent.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(ctx.store.listAudit("demo-user-001")).toHaveLength(2);
    const retried = await ctx.payments.confirm("demo-user-001", prepared.intent.id, prepared.confirmationToken!);
    expect(retried.intent.transactionHash).toBe(completed.intent.transactionHash);
  });

  it("rejects confirmation without the issued token", async () => {
    const prepared = await ctx.payments.prepare("demo-user-001", base);
    await expect(ctx.payments.confirm("demo-user-001", prepared.intent.id, "fake-token")).rejects.toMatchObject({ code: "CONFIRMATION_REQUIRED" });
  });

  it("enforces ownership boundaries", async () => {
    const prepared = await ctx.payments.prepare("demo-user-001", base);
    await expect(ctx.payments.confirm("another-user", prepared.intent.id, prepared.confirmationToken!)).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("returns the same intent for an idempotent retry", async () => {
    const first = await ctx.payments.prepare("demo-user-001", base);
    const second = await ctx.payments.prepare("demo-user-001", base);
    expect(second.intent.id).toBe(first.intent.id);
  });

  it("blocks reused idempotency keys with changed payment data", async () => {
    await ctx.payments.prepare("demo-user-001", base);
    await expect(ctx.payments.prepare("demo-user-001", { ...base, amount: "11" })).rejects.toMatchObject({ code: "DUPLICATE_REQUEST" });
  });

  it("blocks an over-limit agent payment", async () => {
    const prepared = await ctx.payments.prepare("demo-user-001", { ...base, amount: "0.51", initiatedByAgentId: "research-agent", merchantId: "demo-data-api", merchantCategory: "API_PROVIDER", idempotencyKey: "agent-over-limit" });
    expect(prepared.intent.status).toBe("BLOCKED");
    expect(prepared.intent.policyReasonCodes).toContain("PER_TRANSACTION_LIMIT_EXCEEDED");
  });

  it("previews and confirms an agent spending policy", () => {
    const draft = { agentId: "coding-agent", name: "Coding API budget", dailyLimit: "3", perTransactionLimit: "0.25",
      tokenAllowlist: ["USDC" as const], networkAllowlist: ["POLYGON_AMOY" as const], allowedRecipients: [],
      allowedMerchantCategories: ["API_PROVIDER"], merchantAllowlist: ["code-api"], approvalThreshold: "0.05", validUntil: "2027-01-01T00:00:00.000Z" };
    const preview = ctx.policies.previewToken("demo-user-001", draft);
    const policy = ctx.policies.create("demo-user-001", draft, preview.confirmationToken, preview.expiresAt);
    expect(policy.agentId).toBe("coding-agent");
    expect(ctx.store.listPolicies("demo-user-001")).toHaveLength(2);
  });
});
