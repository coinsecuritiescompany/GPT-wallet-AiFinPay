import { afterEach, describe, expect, it } from "vitest";
import { Store } from "../src/storage/store.js";

const addresses = {
  evm: "0x1111111111111111111111111111111111111111",
  solana: "5L7xB9arfakeaddress111111111111111",
  near: "a".repeat(64),
  aptos: `0x${"b".repeat(64)}`
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
});
