import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../src/analytics/analytics-service.js";
import { Store } from "../src/storage/store.js";

const SECRET = "analytics-test-secret-with-32-chars!!";

function service(): { analytics: AnalyticsService; store: Store } {
  const store = new Store(":memory:");
  return { analytics: new AnalyticsService(store, SECRET), store };
}

describe("analytics privacy", () => {
  it("stores a salted hash, never the user id itself", () => {
    const { analytics, store } = service();
    analytics.record("wallet_opened", "server", { userId: "wallet_abc123" });
    const row = store.db.prepare("SELECT user_hash FROM analytics_events").get() as { user_hash: string };
    expect(row.user_hash).not.toContain("wallet_abc123");
    expect(row.user_hash).toMatch(/^[0-9a-f]{24}$/);
    // Deterministic per user (funnels join), different per user (no collisions).
    expect(analytics.userHash("wallet_abc123")).toBe(row.user_hash);
    expect(analytics.userHash("wallet_other")).not.toBe(row.user_hash);
  });

  it("uses a different salt for a different deployment secret", () => {
    const a = new AnalyticsService(new Store(":memory:"), SECRET);
    const b = new AnalyticsService(new Store(":memory:"), "another-deployment-secret-32-chars!!!");
    expect(a.userHash("wallet_abc123")).not.toBe(b.userHash("wallet_abc123"));
  });

  it("never throws even when the write fails", () => {
    const { analytics, store } = service();
    store.db.exec("DROP TABLE analytics_events");
    expect(() => analytics.record("wallet_opened", "server", { userId: "u" })).not.toThrow();
  });
});

describe("analytics funnel and summary", () => {
  it("counts users, actives, funnel stages and referrals", () => {
    const { analytics } = service();
    analytics.record("connector_connected", "server", { userId: "u1", referral: "casper-community" });
    analytics.record("wallet_opened", "server", { userId: "u1" });
    analytics.record("transfer_prepared", "server", { userId: "u1", network: "CASPER", asset: "CSPR", amount: "2.5" });
    analytics.record("transaction_signed", "server", { userId: "u1", network: "CASPER" });
    analytics.record("transaction_confirmed", "server", { userId: "u1", network: "CASPER" });
    analytics.record("wallet_opened", "server", { userId: "u2" });

    const summary = analytics.summary() as any;
    expect(summary.totals.uniqueUsers).toBe(2);
    expect(summary.totals.usersWhoOpenedWallet).toBe(2);
    expect(summary.totals.usersWhoCompletedTransaction).toBe(1);
    expect(summary.totals.walletOpenToCompletedConversion).toBe(0.5);
    expect(summary.activeUsers.daily).toBe(2);
    expect(summary.funnel30d.transaction_confirmed).toBe(1);
    expect(summary.referrals["casper-community"]).toBe(1);
    expect(summary.referrals.organic).toBe(1);

    const slice = analytics.communitySlice() as any;
    expect(slice.users).toBe(1);
    expect(slice.confirmed).toBe(1);
    expect(slice.failed).toBe(0);
  });

  it("keeps the first referral it saw for a user", () => {
    const { analytics, store } = service();
    analytics.record("connector_connected", "server", { userId: "u1", referral: "casper-community" });
    analytics.record("wallet_opened", "server", { userId: "u1", referral: "elsewhere" });
    const row = store.db.prepare("SELECT referral FROM analytics_users").get() as { referral: string };
    expect(row.referral).toBe("casper-community");
  });

  it("prunes raw events past the retention window", () => {
    const { analytics, store } = service();
    analytics.record("wallet_opened", "server", { userId: "u1" });
    store.db.prepare("UPDATE analytics_events SET ts=?").run(new Date(Date.now() - 200 * 86_400_000).toISOString());
    analytics.record("wallet_opened", "server", { userId: "u2" });
    expect(analytics.pruneOldEvents(180)).toBe(1);
    const left = store.db.prepare("SELECT COUNT(*) AS n FROM analytics_events").get() as { n: number };
    expect(Number(left.n)).toBe(1);
  });
});
