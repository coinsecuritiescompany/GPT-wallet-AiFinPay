import { afterEach, describe, expect, it } from "vitest";
import type { PaymentIntent } from "@aifinpay/shared";
import { Store } from "../src/storage/store.js";

const addresses = {
  evm: "0x1111111111111111111111111111111111111111",
  solana: "5L7xB9arfakeaddress111111111111111",
  near: "a".repeat(64),
  aptos: `0x${"b".repeat(64)}`,
  casper: `01${"c".repeat(64)}`
};

describe("wallet pairing storage", () => {
  const stores: Store[] = [];
  afterEach(() => stores.splice(0).forEach((store) => store.close()));

  it("treats a repeated completion with the same public addresses as success", () => {
    const store = new Store(":memory:"); stores.push(store);
    store.createWalletPairing("pair-hash", "user-1", new Date(Date.now() + 60_000).toISOString());
    expect(store.completeWalletPairing("pair-hash", addresses)).toBe("connected");
    expect(store.completeWalletPairing("pair-hash", addresses)).toBe("already_connected");
    expect(store.getWalletConnection("user-1")?.addresses).toEqual(addresses);
  });

  it("rejects token replay with different addresses", () => {
    const store = new Store(":memory:"); stores.push(store);
    store.createWalletPairing("pair-hash", "user-1", new Date(Date.now() + 60_000).toISOString());
    expect(store.completeWalletPairing("pair-hash", addresses)).toBe("connected");
    expect(store.completeWalletPairing("pair-hash", { ...addresses, evm: "0x2222222222222222222222222222222222222222" })).toBe("invalid");
  });

  it("rejects expired and unknown pairing tokens", () => {
    const store = new Store(":memory:"); stores.push(store);
    store.createWalletPairing("expired", "user-1", new Date(Date.now() - 1_000).toISOString());
    expect(store.completeWalletPairing("expired", addresses)).toBe("invalid");
    expect(store.completeWalletPairing("unknown", addresses)).toBe("invalid");
  });

  it("consumes each OAuth authorization code exactly once", () => {
    const store = new Store(":memory:"); stores.push(store);
    const expiresAt = Math.floor(Date.now() / 1000) + 120;
    expect(store.consumeOAuthAuthorizationCode("authorization-code-hash", expiresAt)).toBe(true);
    expect(store.consumeOAuthAuthorizationCode("authorization-code-hash", expiresAt)).toBe(false);
  });

  it("counts only today's submitted spend for the matching agent, token and network", () => {
    const store = new Store(":memory:"); stores.push(store);
    const now = new Date("2026-07-30T12:00:00.000Z");
    const save = (id: string, amountBaseUnits: string, status: PaymentIntent["status"], initiatedById: string, submittedAt: string) => {
      store.saveIntent({
        id,
        ownerUserId: "user-1",
        walletId: "wallet-1",
        initiatedByType: "AGENT",
        initiatedById,
        recipient: "0x2222222222222222222222222222222222222222",
        token: "USDC",
        tokenAddress: null,
        amount: "1",
        amountBaseUnits,
        network: "POLYGON",
        chainId: 137,
        estimatedFee: "Calculated at signing in POL",
        status,
        policyDecision: "AUTO_APPROVED",
        policyReasonCodes: ["ALLOWED_WITHIN_POLICY"],
        riskLevel: "LOW",
        createdAt: submittedAt,
        expiresAt: "2026-07-30T13:00:00.000Z",
        submittedAt,
        idempotencyKey: `key-${id}`,
        auditReceiptId: `receipt-${id}`
      }, `hash-${id}`);
    };
    save("today-complete", "600000", "COMPLETED", "research-agent", "2026-07-30T08:00:00.000Z");
    save("today-pending", "400000", "PENDING", "research-agent", "2026-07-30T09:00:00.000Z");
    save("other-agent", "900000", "COMPLETED", "coding-agent", "2026-07-30T10:00:00.000Z");
    save("yesterday", "2000000", "COMPLETED", "research-agent", "2026-07-29T20:00:00.000Z");
    expect(store.sumSpentTodayRaw("user-1", "research-agent", "USDC", "POLYGON", now)).toBe("1000000");
  });
});
