import { describe, expect, it } from "vitest";
import { SwapService } from "../src/services/swap-service.js";
import {
  NOT_VERIFIED, PairAvailabilityCache, VERIFIED_PAIRS,
  curatedAssets, isVerifiedPair, verifiedPairFor
} from "../src/services/verified-pairs.js";
import { afterEach, vi } from "vitest";

const asset = (ticker: string, network: string) => ({ ticker, name: ticker.toUpperCase(), network });

const cspr = asset("cspr", "cspr");
const usdtMatic = asset("usdt", "matic");
const pol = asset("pol", "matic");
const avax = asset("avax", "avaxc");
const sand = asset("sand", "matic");

const PROVIDER_LIST = [cspr, usdtMatic, pol, avax, sand, asset("sol", "sol"), asset("eth", "base"), asset("usdc", "base")];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("verified pair registry", () => {
  it("includes the pairs confirmed against the live provider", () => {
    expect(isVerifiedPair(cspr, usdtMatic)).toBe(true);
    expect(isVerifiedPair(usdtMatic, cspr)).toBe(true);
    expect(isVerifiedPair(cspr, asset("sol", "sol"))).toBe(true);
    expect(isVerifiedPair(cspr, asset("usdc", "base"))).toBe(true);
    // Every entry carries the evidence fields the registry promises.
    for (const pair of VERIFIED_PAIRS) {
      expect(pair.status).toBe("verified");
      expect(pair.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(Number(pair.minimumTestAmount)).toBeGreaterThan(0);
    }
  });

  it("matches pairs case-insensitively so provider casing cannot bypass the registry", () => {
    expect(isVerifiedPair(asset("CSPR", "CSPR"), asset("USDT", "MATIC"))).toBe(true);
    expect(verifiedPairFor(asset("CSPR", "cspr"), usdtMatic)?.minimumTestAmount).toBe("150");
  });

  it("treats an unverified pair as unverified even when both assets are verified elsewhere", () => {
    // Both legs appear in the registry, the specific route does not.
    expect(isVerifiedPair(asset("near", "near"), cspr)).toBe(false);
    expect(isVerifiedPair(asset("bnb", "bsc"), asset("eth", "base"))).toBe(false);
  });

  it("excludes POL from the verified defaults", () => {
    expect(VERIFIED_PAIRS.some((p) => p.from.ticker === "pol" || p.to.ticker === "pol")).toBe(false);
    expect(curatedAssets(PROVIDER_LIST).some((a) => a.ticker === "pol")).toBe(false);
    expect(NOT_VERIFIED.some((e) => e.ticker === "pol")).toBe(true);
  });

  it("excludes AVAX, which the provider rejects, and untested assets like SAND", () => {
    expect(curatedAssets(PROVIDER_LIST).some((a) => a.ticker === "avax")).toBe(false);
    expect(curatedAssets(PROVIDER_LIST).some((a) => a.ticker === "sand")).toBe(false);
  });

  it("drops assets the provider stopped listing rather than inventing them", () => {
    // CSPR missing from the provider response must not reappear from the registry.
    const withoutCspr = PROVIDER_LIST.filter((a) => a.ticker !== "cspr");
    expect(curatedAssets(withoutCspr).some((a) => a.ticker === "cspr")).toBe(false);
  });
});

describe("PairAvailabilityCache", () => {
  it("repeats a recent refusal without asking the provider again", () => {
    const cache = new PairAvailabilityCache(60_000, () => 1_000);
    expect(cache.recentlyFailed(cspr, sand)).toBeUndefined();
    cache.record(cspr, sand, false, "pair_is_inactive");
    expect(cache.recentlyFailed(cspr, sand)).toMatchObject({ reason: "pair_is_inactive" });
  });

  it("forgets a refusal once the entry expires", () => {
    let now = 1_000;
    const cache = new PairAvailabilityCache(60_000, () => now);
    cache.record(cspr, sand, false, "pair_is_inactive");
    now += 60_001;
    expect(cache.recentlyFailed(cspr, sand)).toBeUndefined();
  });

  it("cannot promote an unverified pair to verified", () => {
    const cache = new PairAvailabilityCache(60_000, () => 1_000);
    // A successful quote is recorded, which is the strongest thing the cache
    // can learn — the registry must still refuse to call the pair verified.
    cache.record(cspr, sand, true);
    expect(cache.recentlyFailed(cspr, sand)).toBeUndefined();
    expect(isVerifiedPair(cspr, sand)).toBe(false);
    expect(curatedAssets(PROVIDER_LIST).some((a) => a.ticker === "sand")).toBe(false);
  });
});

describe("SwapService curated listing", () => {
  afterEach(() => vi.unstubAllGlobals());

  const service = () => new SwapService("private-provider-key", "a-secret-that-is-long-enough-for-tests");

  it("returns only curated assets by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(PROVIDER_LIST)));
    const { assets, verified } = await service().listCuratedAssets();
    expect(verified).toBe(true);
    expect(assets.map((a) => a.ticker).sort()).toEqual(["cspr", "eth", "sol", "usdc", "usdt"]);
  });

  it("advanced mode returns the full list but never claims it is verified", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(PROVIDER_LIST)));
    const { assets, verified } = await service().listCuratedAssets(true);
    expect(verified).toBe(false);
    expect(assets.length).toBe(PROVIDER_LIST.length);
    expect(assets.some((a) => a.ticker === "pol")).toBe(true);
    // Listing an asset in advanced mode says nothing about the pair.
    expect(isVerifiedPair(cspr, pol)).toBe(false);
  });

  it("surfaces an inactive pair explicitly instead of silently degrading", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json(PROVIDER_LIST))
      .mockResolvedValueOnce(json({ error: "pair_is_inactive", message: "" }, 400)));
    await expect(service().quote("user-1", cspr, sand, "150"))
      .rejects.toMatchObject({ code: "SWAP_UNAVAILABLE", message: /cannot be swapped right now/ });
  });

  it("reuses the cached refusal on the next attempt at the same pair", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(PROVIDER_LIST))
      .mockResolvedValueOnce(json({ error: "pair_is_inactive", message: "" }, 400))
      .mockResolvedValue(json(PROVIDER_LIST));
    vi.stubGlobal("fetch", fetchMock);
    const svc = service();
    await expect(svc.quote("user-1", cspr, sand, "150")).rejects.toMatchObject({ code: "SWAP_UNAVAILABLE" });
    const callsAfterFirst = fetchMock.mock.calls.length;
    await expect(svc.quote("user-1", cspr, sand, "150")).rejects.toMatchObject({ code: "SWAP_UNAVAILABLE" });
    // Asset list may be cached or refetched; the quote endpoint must not be hit again.
    const quoteCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("estimated-amount")).length;
    expect(quoteCalls).toBe(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(callsAfterFirst + 1);
  });
});
