import { describe, expect, it } from "vitest";
import { LIVE_NETWORKS, paymentAssetSpec, type LiveNetworkSpec, type NetworkId } from "@aifinpay/shared";

// payment-service validates a recipient per chain family and throws
// "Direct sending on X is not implemented yet" for anything it does not know.
// Casper had no branch, so prepare() rejected every CSPR transfer before the
// adapter that builds the deploy was ever reached — the transfer tool, the
// signing gate and the deploy codec were all live and unreachable.
//
// This asserts every live family is handled, so adding a network without
// teaching the validator about it fails here rather than in someone's wallet.
const HANDLED_FAMILIES = new Set(["EVM", "SOLANA", "NEAR", "APTOS", "CASPER"]);

describe("recipient validation covers every live network family", () => {
  it("knows how to validate a recipient on every network we serve", () => {
    for (const [id, spec] of Object.entries(LIVE_NETWORKS as Record<string, LiveNetworkSpec>)) {
      expect(HANDLED_FAMILIES.has(spec.family), `${id} (${spec.family}) has no recipient validator`).toBe(true);
    }
  });

  it("resolves a native asset for every live network, Casper included", () => {
    for (const id of Object.keys(LIVE_NETWORKS)) {
      const asset = paymentAssetSpec(id as NetworkId, "POL");
      expect(asset, `${id} has no native asset spec`).not.toBeNull();
      expect(asset!.decimals).toBeGreaterThan(0);
    }
    const cspr = paymentAssetSpec("CASPER" as NetworkId, "POL");
    expect(cspr).toMatchObject({ symbol: "CSPR", decimals: 9, address: null });
  });

  it("has no canonical USDC on Casper, so a stablecoin send must be refused", () => {
    expect(paymentAssetSpec("CASPER" as NetworkId, "USDC")).toBeNull();
  });
});
