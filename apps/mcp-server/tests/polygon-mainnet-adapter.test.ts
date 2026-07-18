import { afterEach, describe, expect, it, vi } from "vitest";
import { Store } from "../src/storage/store.js";
import { PolygonMainnetAdapter } from "../src/services/polygon-mainnet-adapter.js";

describe("PolygonMainnetAdapter", () => {
  const stores: Store[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    stores.splice(0).forEach((store) => store.close());
  });

  it("loads live-shaped POL and native USDC balances for the connected public address", async () => {
    const store = new Store(":memory:"); stores.push(store);
    const address = "0x1111111111111111111111111111111111111111";
    store.createWalletPairing("mainnet-pair", "demo-user-001", new Date(Date.now() + 60_000).toISOString());
    store.completeWalletPairing("mainnet-pair", { evm: address, solana: "sol", near: "near", aptos: "apt" });
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: any[] };
      const result = request.method === "eth_getBalance" ? "0xde0b6b3a7640000" : "0x17d7840";
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new PolygonMainnetAdapter(store, ["https://polygon.example"]);
    const summary = await adapter.getWalletSummary("demo-user-001", "POLYGON");
    expect(summary).toMatchObject({ mode: "MAINNET", selectedNetwork: "POLYGON", address });
    expect(summary.balances).toEqual([
      { token: "USDC", raw: "25000000", formatted: "25", decimals: 6 },
      { token: "POL", raw: "1000000000000000000", formatted: "1", decimals: 18 }
    ]);
    expect(summary.latestTransactions).toEqual([]);
    const calls = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as { method: string; params: any[] });
    expect(String(calls.find((call) => call.method === "eth_call")?.params[0].to)).toBe("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
  });

  it("refuses mainnet reads until a wallet is connected", async () => {
    const store = new Store(":memory:"); stores.push(store);
    const adapter = new PolygonMainnetAdapter(store, ["https://polygon.example"]);
    await expect(adapter.getWalletSummary("demo-user-001", "POLYGON")).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });
});
