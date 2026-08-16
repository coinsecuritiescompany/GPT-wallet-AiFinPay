export type AiFinPayMainnet =
  | "polygon" | "avalanche" | "arbitrum" | "bnb" | "base" | "unichain"
  | "optimism" | "botchain" | "xrplevm" | "solana" | "near" | "aptos" | "casper";

export type SettlementStableSymbol = "USDC" | "USDT";

export interface CanonicalSettlementAsset {
  symbol: SettlementStableSymbol;
  network: AiFinPayMainnet;
  address: string;
  decimals: number;
  issuer: "Circle" | "Tether";
  evidence: string;
}

/**
 * Canonical payment assets, intentionally stricter than the historical
 * read-only balance registry. This registry is allowed to drive VALUE MOVEMENT.
 *
 * Verified for the 2026-08-16 production RC from issuer documentation.
 * No bridged, Binance-Peg or guessed token is promoted here automatically.
 */
export const CANONICAL_SETTLEMENT_STABLES: Readonly<Record<AiFinPayMainnet, readonly CanonicalSettlementAsset[]>> = {
  polygon: [
    { symbol: "USDC", network: "polygon", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  avalanche: [
    { symbol: "USDC", network: "avalanche", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" },
    { symbol: "USDT", network: "avalanche", address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", decimals: 6, issuer: "Tether", evidence: "Tether supported-protocols registry; verified 2026-08-16" }
  ],
  arbitrum: [
    { symbol: "USDC", network: "arbitrum", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  bnb: [],
  base: [
    { symbol: "USDC", network: "base", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  unichain: [
    { symbol: "USDC", network: "unichain", address: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  optimism: [
    { symbol: "USDC", network: "optimism", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  botchain: [],
  xrplevm: [],
  solana: [
    { symbol: "USDC", network: "solana", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" },
    { symbol: "USDT", network: "solana", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6, issuer: "Tether", evidence: "Tether supported-protocols registry; verified 2026-08-16" }
  ],
  near: [
    { symbol: "USDC", network: "near", address: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
  ],
  aptos: [
    { symbol: "USDC", network: "aptos", address: "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b", decimals: 6, issuer: "Circle", evidence: "Circle USDC contract-address registry; verified 2026-08-16" }
    // USD₮ exists on Aptos, but its exact canonical identifier is not hard-coded
    // here until the deployment review records and verifies the issuer address.
  ],
  casper: []
} as const;

/** ChangeNOW provider network codes. Absence means no automatic provider route. */
export const CHANGENOW_NETWORK_CODE: Readonly<Partial<Record<AiFinPayMainnet, string>>> = {
  polygon: "matic",
  avalanche: "avaxc",
  arbitrum: "arbitrum",
  bnb: "bsc",
  base: "base",
  unichain: "unichain",
  optimism: "op",
  solana: "sol",
  near: "near",
  aptos: "apt",
  casper: "cspr"
  // BOT Chain and XRPL EVM have no reviewed ChangeNOW address/network mapping.
};

export function canonicalSettlementAsset(
  network: AiFinPayMainnet,
  symbol: SettlementStableSymbol
): CanonicalSettlementAsset | null {
  return CANONICAL_SETTLEMENT_STABLES[network].find((asset) => asset.symbol === symbol) ?? null;
}

export function canonicalSettlementSymbols(network: AiFinPayMainnet): SettlementStableSymbol[] {
  return CANONICAL_SETTLEMENT_STABLES[network].map((asset) => asset.symbol);
}

/**
 * Pick a conservative settlement target for a source network.
 * Prefer same-chain issuer-backed USDC. If that chain has no approved stable,
 * fall back to Polygon USDC ONLY when the source has a reviewed ChangeNOW code.
 * The provider must still confirm the actual pair at quote time.
 */
export function preferredSettlementTarget(source: AiFinPayMainnet): CanonicalSettlementAsset | null {
  const same = canonicalSettlementAsset(source, "USDC");
  if (same) return same;
  if (!CHANGENOW_NETWORK_CODE[source]) return null;
  return canonicalSettlementAsset("polygon", "USDC");
}

export function assertCanonicalSettlementAsset(
  network: AiFinPayMainnet,
  symbol: SettlementStableSymbol,
  address: string
): CanonicalSettlementAsset {
  const expected = canonicalSettlementAsset(network, symbol);
  if (!expected || expected.address.toLowerCase() !== String(address).toLowerCase()) {
    throw new Error(`${symbol} on ${network} is not an issuer-verified AiFinPay settlement asset`);
  }
  return expected;
}
