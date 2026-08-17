import { describe, expect, it } from "vitest";
import {
  AIFINPAY_TREASURY_NETWORKS,
  assertNoExternalTreasuryProviders,
  localTreasuryPlan,
  treasuryAssetsForNetwork,
} from "./treasury-policy.js";

describe("AiFinPay local treasury custody policy", () => {
  it("covers exactly the 13 product networks", () => {
    expect(AIFINPAY_TREASURY_NETWORKS).toHaveLength(13);
    expect(new Set(AIFINPAY_TREASURY_NETWORKS).size).toBe(13);
  });

  it("never enables a swap, bridge, exchange or forwarding provider", () => {
    expect(assertNoExternalTreasuryProviders()).toBe(true);
    for (const network of AIFINPAY_TREASURY_NETWORKS) {
      const plan = localTreasuryPlan(network);
      expect(plan.kind).toBe("LOCAL_CHAIN");
      expect(plan.externalProvider).toBeNull();
      expect(plan.automaticCrossChainMovement).toBe(false);
      expect(plan.network).toBe(network);
    }
  });

  it("always accounts for the native asset and only exact reviewed stable symbols", () => {
    for (const network of AIFINPAY_TREASURY_NETWORKS) {
      const assets = treasuryAssetsForNetwork(network);
      expect(assets[0]).toBe("NATIVE");
      expect(new Set(assets).size).toBe(assets.length);
      for (const asset of assets) expect(["NATIVE", "USDC", "USDT"]).toContain(asset);
    }
  });

  it("does not invent token treasury support where the current contract is native-only", () => {
    for (const network of ["botchain", "xrplevm", "near", "aptos", "casper"] as const) {
      expect(treasuryAssetsForNetwork(network)).toEqual(["NATIVE"]);
    }
  });
});
