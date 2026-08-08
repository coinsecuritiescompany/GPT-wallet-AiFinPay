import type { SwapAsset } from "@aifinpay/shared";

/**
 * Verified swap pairs — the curated default for the swap UI.
 *
 * The provider lists every asset it supports on the networks our Vault
 * controls: 575 assets, which is 330,050 selectable pairs. A random sample of
 * those quoted successfully only about 44% of the time; roughly 40% answered
 * `pair_is_inactive`. **An active asset list is not a pair-availability list**,
 * and offering all of them means most of what a user can pick cannot be paid.
 *
 * So the default selector is seeded only with pairs that were quoted live
 * against the provider and returned a real price. The full provider list stays
 * reachable behind an explicit "show all" flag, clearly marked as unverified.
 *
 * Adding an entry here is a claim that the pair was quoted successfully. Verify
 * before adding; do not add a pair because the provider lists both assets.
 */
export interface VerifiedPair {
  from: { ticker: string; network: string };
  to: { ticker: string; network: string };
  /** An amount known to clear the provider's minimum at verification time. */
  minimumTestAmount: string;
  status: "verified";
  /** When this pair last returned a live quote. */
  lastVerified: string;
  note?: string;
}

const VERIFIED_AT = "2026-08-08T19:52:51Z";

export const VERIFIED_PAIRS: readonly VerifiedPair[] = [
  { from: { ticker: "cspr", network: "cspr" },  to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "150",  status: "verified", lastVerified: VERIFIED_AT, note: "Stablecoin output — the clearest first test." },
  { from: { ticker: "usdt", network: "matic" }, to: { ticker: "cspr", network: "cspr" },  minimumTestAmount: "20",   status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "cspr", network: "cspr" },  to: { ticker: "sol",  network: "sol" },   minimumTestAmount: "150",  status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "sol",  network: "sol" },   to: { ticker: "cspr", network: "cspr" },  minimumTestAmount: "0.1",  status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "cspr", network: "cspr" },  to: { ticker: "usdc", network: "base" },  minimumTestAmount: "150",  status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "cspr", network: "cspr" },  to: { ticker: "eth",  network: "base" },  minimumTestAmount: "150",  status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "sol",  network: "sol" },   to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "0.1",  status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "usdt", network: "matic" }, to: { ticker: "sol",  network: "sol" },   minimumTestAmount: "20",   status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "eth",  network: "base" },  to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "0.01", status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "bnb",  network: "bsc" },   to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "0.05", status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "near", network: "near" },  to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "5",    status: "verified", lastVerified: VERIFIED_AT },
  { from: { ticker: "apt",  network: "apt" },   to: { ticker: "usdt", network: "matic" }, minimumTestAmount: "2",    status: "verified", lastVerified: VERIFIED_AT }
];

/**
 * Tickers the provider does not accept, kept out of the verified set even
 * though the asset appears in its own currency list.
 *
 *  - `pol` — the provider answers "Currency pol is not supported" on every
 *    route, in both directions. Polygon's native token is not quotable.
 *  - `avax` on avaxc — answers `not_valid_params` against USDT; last checked
 *    2026-08-08. Re-verify before offering it.
 */
export const NOT_VERIFIED: readonly { ticker: string; network?: string; reason: string }[] = [
  { ticker: "pol", reason: "provider does not recognise the ticker" },
  { ticker: "avax", network: "avaxc", reason: "not_valid_params against USDT, last checked 2026-08-08" }
];

const key = (t: string, n: string) => `${t.toLowerCase()}:${n.toLowerCase()}`;
const pairKey = (f: SwapAsset | VerifiedPair["from"], t: SwapAsset | VerifiedPair["to"]) =>
  `${key(f.ticker, f.network)}->${key(t.ticker, t.network)}`;

const VERIFIED_KEYS = new Set(VERIFIED_PAIRS.map((p) => pairKey(p.from, p.to)));

/** True only for a pair that was quoted live and recorded above. */
export function isVerifiedPair(from: SwapAsset, to: SwapAsset): boolean {
  return VERIFIED_KEYS.has(pairKey(from, to));
}

export function verifiedPairFor(from: SwapAsset, to: SwapAsset): VerifiedPair | undefined {
  return VERIFIED_PAIRS.find((p) => pairKey(p.from, p.to) === pairKey(from, to));
}

/** Assets reachable through at least one verified pair, in either direction. */
export function verifiedAssetKeys(): Set<string> {
  const keys = new Set<string>();
  for (const p of VERIFIED_PAIRS) {
    keys.add(key(p.from.ticker, p.from.network));
    keys.add(key(p.to.ticker, p.to.network));
  }
  return keys;
}

export function isExcludedFromVerified(assetToCheck: SwapAsset): boolean {
  return NOT_VERIFIED.some((entry) =>
    entry.ticker === assetToCheck.ticker.toLowerCase()
    && (!entry.network || entry.network === assetToCheck.network.toLowerCase()));
}

/**
 * Narrow the provider's asset list to the assets a verified pair actually
 * needs. Anything the provider stopped listing simply drops out, so this can
 * never present an asset the provider no longer supports.
 */
export function curatedAssets(providerAssets: SwapAsset[]): SwapAsset[] {
  const wanted = verifiedAssetKeys();
  return providerAssets.filter(
    (a) => wanted.has(key(a.ticker, a.network)) && !isExcludedFromVerified(a)
  );
}

/**
 * Short-lived record of what the provider said about a pair.
 *
 * This exists so a refusal is not rediscovered on every keystroke. It reports
 * provider availability only — it can never move a pair into the verified set,
 * because `isVerifiedPair` reads the static registry above and never consults
 * this cache.
 */
export class PairAvailabilityCache {
  private readonly entries = new Map<string, { quotable: boolean; reason?: string; expiresAt: number }>();

  constructor(private readonly ttlMs = 5 * 60_000, private readonly now = () => Date.now()) {}

  record(from: SwapAsset, to: SwapAsset, quotable: boolean, reason?: string): void {
    this.entries.set(pairKey(from, to), {
      quotable, ...(reason ? { reason } : {}), expiresAt: this.now() + this.ttlMs
    });
  }

  /** undefined = nothing known recently. Never asserts a pair is verified. */
  recentlyFailed(from: SwapAsset, to: SwapAsset): { reason?: string } | undefined {
    const hit = this.entries.get(pairKey(from, to));
    if (!hit || hit.expiresAt <= this.now()) return undefined;
    if (hit.quotable) return undefined;
    return hit.reason ? { reason: hit.reason } : {};
  }
}
