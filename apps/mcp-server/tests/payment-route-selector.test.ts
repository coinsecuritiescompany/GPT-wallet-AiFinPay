import { describe, expect, it } from "vitest";
import type { WalletAdapter } from "@aifinpay/aifinpay-adapter";
import { PaymentRouteSelector } from "../src/services/payment-route-selector.js";

function adapterWith(balances: Record<string, string>): WalletAdapter {
  return {
    getBalance: async (_userId: string, token: "USDC" | "POL", network: string) => ({
      token,
      raw: balances[`${network}:${token}`] ?? "0",
      formatted: "0",
      decimals: token === "USDC" ? 6 : 18,
    }),
  } as unknown as WalletAdapter;
}

const routes = [
  { route_class: "AIFP-1", network: "polygon", live: true },
  { route_class: "AIFP-1", network: "base", live: true },
  { route_class: "AIFP-1", network: "avalanche", live: false },
  { route_class: "AIFP-2", network: "polygon", live: true },
];

describe("provider-free AiFinPay payment route selector", () => {
  it("selects the first merchant-priority route that is live and funded", async () => {
    const selector = new PaymentRouteSelector(adapterWith({
      "POLYGON:USDC": "500000",
      "BASE:USDC": "3000000",
    }));
    const result = await selector.select({
      userId: "u1",
      routeClass: "AIFP-1",
      backendRoutes: routes,
      candidates: [
        { chain: "polygon", asset: "USDC", merchantWallet: "0x1111111111111111111111111111111111111111", grossAmount: "1000000", orderId: "o1" },
        { chain: "base", asset: "USDC", merchantWallet: "0x2222222222222222222222222222222222222222", grossAmount: "1000000", orderId: "o1" },
      ],
    });
    expect(result.selected?.chain).toBe("base");
    expect(result.externalSwapOrBridgeUsed).toBe(false);
    expect(result.evaluations.map((row) => row.reason)).toEqual(["INSUFFICIENT_BALANCE", "READY"]);
  });

  it("never rescues an unfunded route with an external swap or bridge", async () => {
    const selector = new PaymentRouteSelector(adapterWith({}));
    const result = await selector.select({
      userId: "u1",
      routeClass: "AIFP-1",
      backendRoutes: routes,
      candidates: [
        { chain: "polygon", asset: "USDC", merchantWallet: "0x1111111111111111111111111111111111111111", grossAmount: "1000000", orderId: "o1" },
      ],
    });
    expect(result.selected).toBeNull();
    expect(result.externalSwapOrBridgeUsed).toBe(false);
    expect(result.evaluations[0]?.reason).toBe("INSUFFICIENT_BALANCE");
  });

  it("skips routes that backend has not activated", async () => {
    const selector = new PaymentRouteSelector(adapterWith({ "AVALANCHE:POL": "999999999999999999" }));
    const result = await selector.select({
      userId: "u1",
      routeClass: "AIFP-1",
      backendRoutes: routes,
      candidates: [
        { chain: "avalanche", asset: "AVAX", merchantWallet: "0x1111111111111111111111111111111111111111", grossAmount: "1", orderId: "o1" },
      ],
    });
    expect(result.selected).toBeNull();
    expect(result.evaluations[0]?.reason).toBe("ROUTE_NOT_LIVE");
  });

  it("fails closed for assets the current wallet balance adapter cannot independently verify", async () => {
    const selector = new PaymentRouteSelector(adapterWith({}));
    const result = await selector.select({
      userId: "u1",
      routeClass: "AIFP-1",
      backendRoutes: [{ route_class: "AIFP-1", network: "avalanche", live: true }],
      candidates: [
        { chain: "avalanche", asset: "USDT", merchantWallet: "0x1111111111111111111111111111111111111111", grossAmount: "1000000", orderId: "o1" },
      ],
    });
    expect(result.selected).toBeNull();
    expect(result.evaluations[0]?.reason).toBe("ASSET_BALANCE_READER_UNAVAILABLE");
  });
});
