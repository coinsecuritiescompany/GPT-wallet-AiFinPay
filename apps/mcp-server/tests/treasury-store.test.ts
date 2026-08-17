import { describe, expect, it } from "vitest";
import { Store, type TreasuryBalanceSnapshot } from "../src/storage/store.js";

function snapshot(id: string, network = "polygon", asset = "USDC", raw = "25000000"): TreasuryBalanceSnapshot {
  return {
    id,
    network,
    address: "0x1111111111111111111111111111111111111111",
    asset,
    symbol: asset,
    raw,
    decimals: asset === "NATIVE" ? 18 : 6,
    tokenAddress: asset === "NATIVE" ? null : "0x2222222222222222222222222222222222222222",
    observedAt: new Date().toISOString(),
  };
}

describe("read-only treasury accounting store", () => {
  it("stores append-only observations and returns latest network/asset state", () => {
    const store = new Store(":memory:");
    try {
      store.saveTreasuryBalanceSnapshot(snapshot("tb_1", "polygon", "USDC", "1000000"));
      store.saveTreasuryBalanceSnapshot(snapshot("tb_2", "polygon", "USDC", "2000000"));
      store.saveTreasuryBalanceSnapshot(snapshot("tb_3", "base", "USDC", "3000000"));
      const latest = store.latestTreasuryBalances();
      expect(latest).toHaveLength(2);
      expect(latest.find((row) => row.network === "polygon")?.raw).toBe("2000000");
      expect(latest.find((row) => row.network === "base")?.raw).toBe("3000000");
      expect(store.listTreasuryBalanceSnapshots(10)).toHaveLength(3);
    } finally { store.close(); }
  });

  it("contains no treasury sweep/movement methods", () => {
    const store = new Store(":memory:");
    try {
      const value = store as unknown as Record<string, unknown>;
      expect(value.saveTreasurySweep).toBeUndefined();
      expect(value.hasOpenTreasurySweep).toBeUndefined();
      expect(value.getTreasurySweep).toBeUndefined();
    } finally { store.close(); }
  });
});
