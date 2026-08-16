import { canonicalSettlementSymbols, type AiFinPayMainnet } from "./settlement-assets.js";

export type TreasurySourceAsset = "NATIVE" | "USDC" | "USDT";
export type TreasuryCustodyKind = "LOCAL_CHAIN";

export interface TreasuryCustodyPlan {
  network: AiFinPayMainnet;
  kind: TreasuryCustodyKind;
  assets: TreasurySourceAsset[];
  externalProvider: null;
  automaticCrossChainMovement: false;
  reason: string;
}

export const AIFINPAY_TREASURY_NETWORKS: readonly AiFinPayMainnet[] = Object.freeze([
  "polygon", "avalanche", "arbitrum", "bnb", "base", "unichain", "optimism",
  "botchain", "xrplevm", "solana", "near", "aptos", "casper",
]);

/**
 * Only assets the CURRENT reviewed settlement implementation can send to the
 * AiFinPay treasury on that network. Asset existence alone is not enough.
 */
export function treasuryAssetsForNetwork(network: AiFinPayMainnet): TreasurySourceAsset[] {
  const assets: TreasurySourceAsset[] = ["NATIVE"];
  if (network === "near" || network === "aptos" || network === "casper") return assets;
  for (const symbol of canonicalSettlementSymbols(network)) {
    if ((symbol === "USDC" || symbol === "USDT") && !assets.includes(symbol)) assets.push(symbol);
  }
  return assets;
}

export function localTreasuryPlan(network: AiFinPayMainnet): TreasuryCustodyPlan {
  return {
    network,
    kind: "LOCAL_CHAIN",
    assets: treasuryAssetsForNetwork(network),
    externalProvider: null,
    automaticCrossChainMovement: false,
    reason: "AiFinPay protocol fees remain on the settlement network in an AiFinPay-controlled local treasury. No external swap, bridge, exchange or forwarding provider participates in the production money path.",
  };
}

/** Hard invariant used by CI and release evidence. */
export function assertNoExternalTreasuryProviders(): true {
  for (const network of AIFINPAY_TREASURY_NETWORKS) {
    const plan = localTreasuryPlan(network);
    if (plan.externalProvider !== null || plan.automaticCrossChainMovement !== false || plan.kind !== "LOCAL_CHAIN") {
      throw new Error(`External treasury movement unexpectedly enabled for ${network}`);
    }
  }
  return true;
}
