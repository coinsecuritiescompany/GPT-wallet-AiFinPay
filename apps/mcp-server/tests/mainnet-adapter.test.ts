import { afterEach, describe, expect, it, vi } from "vitest";
import { Store } from "../src/storage/store.js";
import { MainnetAdapter } from "../src/services/mainnet-adapter.js";

const EVM = "0x1111111111111111111111111111111111111111";
const NEAR_ACCT = "548178623b44c06b5312a415f260e5fe2a2a7c5cc5704b19cbee1d094e7b78eb";
const CASPER = `01${"a".repeat(64)}`; // ed25519 account public key

function connectedStore(stores: Store[]): Store {
  const store = new Store(":memory:"); stores.push(store);
  store.createWalletPairing("pair", "demo-user-001", new Date(Date.now() + 60_000).toISOString());
  store.completeWalletPairing("pair", { evm: EVM, solana: "So11111111111111111111111111111111111111112", near: NEAR_ACCT, aptos: "0x1", casper: CASPER });
  return store;
}

describe("MainnetAdapter", () => {
  const stores: Store[] = [];
  afterEach(() => {
    vi.unstubAllGlobals();
    stores.splice(0).forEach((store) => store.close());
  });

  it("loads Polygon native POL and native USDC balances for the connected public address", async () => {
    const store = connectedStore(stores);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: any[] };
      const result = request.method === "eth_getBalance" ? "0xde0b6b3a7640000" : "0x17d7840";
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store, { POLYGON: ["https://polygon.example"] });
    const summary = await adapter.getWalletSummary("demo-user-001", "POLYGON");
    expect(summary).toMatchObject({ mode: "MAINNET", selectedNetwork: "POLYGON", address: EVM });
    expect(summary.balances).toEqual([
      { token: "USDC", raw: "25000000", formatted: "25", decimals: 6 },
      { token: "POL", raw: "1000000000000000000", formatted: "1", decimals: 18 }
    ]);
    const usdcCall = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)) as { method: string; params: any[] }).find((c) => c.method === "eth_call");
    expect(String(usdcCall?.params[0].to)).toBe("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359");
  });

  it("uses the chain-specific USDC contract and native symbol on Base", async () => {
    const store = connectedStore(stores);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: any[] };
      const result = request.method === "eth_getBalance" ? "0x0" : "0xf4240"; // 1.000000 USDC
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store);
    const usdc = await adapter.getBalance("demo-user-001", "USDC", "BASE");
    const eth = await adapter.getBalance("demo-user-001", "POL", "BASE");
    expect(usdc).toEqual({ token: "USDC", raw: "1000000", formatted: "1", decimals: 6 });
    expect(eth.token).toBe("ETH");
    const usdcCall = fetchMock.mock.calls.map((c) => JSON.parse(String(c[1]?.body)) as { method: string; params: any[] }).find((c) => c.method === "eth_call");
    expect(String(usdcCall?.params[0].to)).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  });

  it("honours BNB USDC's 18 decimals", async () => {
    const store = connectedStore(stores);
    // 1 USDC on BNB = 1e18 base units
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: "0xde0b6b3a7640000" }) } as Response)));
    const adapter = new MainnetAdapter(store);
    const usdc = await adapter.getBalance("demo-user-001", "USDC", "BNB");
    expect(usdc).toEqual({ token: "USDC", raw: "1000000000000000000", formatted: "1", decimals: 18 });
  });

  it("reads native NEAR via query view_account (24 decimals)", async () => {
    const store = connectedStore(stores);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      expect(request.method).toBe("query");
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { amount: "2270000000000000000000000" } }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store);
    const near = await adapter.getBalance("demo-user-001", "POL", "NEAR");
    expect(near).toMatchObject({ token: "NEAR", decimals: 24, formatted: "2.27" });
    // NEAR has no configured USDC slot, so the summary carries native only.
    const summary = await adapter.getWalletSummary("demo-user-001", "NEAR");
    expect(summary.balances.map((b) => b.token)).toEqual(["NEAR"]);
  });

  it("reads native CSPR via query_balance and sends the configured auth header (9 decimals)", async () => {
    const store = connectedStore(stores);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: { purse_identifier: { main_purse_under_public_key: string } } };
      expect(request.method).toBe("query_balance");
      expect(request.params.purse_identifier.main_purse_under_public_key).toBe(CASPER);
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { balance: "2500000000" } }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store, { CASPER: ["https://casper.example/rpc"] }, { CASPER: "Bearer test-key" });
    const cspr = await adapter.getBalance("demo-user-001", "POL", "CASPER");
    expect(cspr).toEqual({ token: "CSPR", raw: "2500000000", formatted: "2.5", decimals: 9 });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).authorization).toBe("Bearer test-key");
    // Casper has no configured USDC slot, so the summary carries native only.
    const summary = await adapter.getWalletSummary("demo-user-001", "CASPER");
    expect(summary.balances.map((b) => b.token)).toEqual(["CSPR"]);
  });

  it("treats an unfunded Casper account (no main purse) as a zero balance, not an outage", async () => {
    const store = connectedStore(stores);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32003, message: "Failed to get the purse; account not found" } })
    } as Response)));
    const adapter = new MainnetAdapter(store, { CASPER: ["https://casper.example/rpc"] });
    const cspr = await adapter.getBalance("demo-user-001", "POL", "CASPER");
    expect(cspr).toEqual({ token: "CSPR", raw: "0", formatted: "0", decimals: 9 });
  });

  it("refuses mainnet reads until a wallet is connected", async () => {
    const store = new Store(":memory:"); stores.push(store);
    const adapter = new MainnetAdapter(store);
    await expect(adapter.getWalletSummary("demo-user-001", "POLYGON")).rejects.toMatchObject({ code: "WALLET_NOT_FOUND" });
  });

  it("keeps custodial (server-side) signing locked", async () => {
    const store = connectedStore(stores);
    const adapter = new MainnetAdapter(store);
    await expect(adapter.execute({} as never)).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });

  it("builds an EIP-1559 USDC transfer for the Vault to sign", async () => {
    const store = connectedStore(stores);
    const recipient = "0x2222222222222222222222222222222222222222";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      const result = ({
        eth_getTransactionCount: "0x5",
        eth_maxPriorityFeePerGas: "0x77359400", // 2 gwei
        eth_getBlockByNumber: { baseFeePerGas: "0x3b9aca00" }, // 1 gwei base fee
        eth_estimateGas: "0x186a0" // 100000
      } as Record<string, unknown>)[request.method];
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store, { POLYGON: ["https://polygon.example"] });
    const intent = { network: "POLYGON", chainId: 137, token: "USDC", recipient, amountBaseUnits: "100000" } as never;
    const tx = await adapter.buildTransferTransaction("demo-user-001", intent);
    expect(tx).toMatchObject({
      to: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      value: "0x0",
      nonce: 5,
      chainId: 137,
      maxPriorityFeePerGas: "0x77359400",
      maxFeePerGas: "0xee6b2800", // base*2 + priority = 4 gwei
      gas: "0x1d4c0" // 100000 + 20% buffer = 120000
    });
    expect(tx.data.startsWith("0xa9059cbb")).toBe(true); // transfer(address,uint256)
    expect(tx.data).toContain(recipient.slice(2).toLowerCase().padStart(64, "0"));
    expect(tx.data.endsWith("186a0")).toBe(true); // amount 100000 encoded
  });

  it("builds a native transfer with the amount as the value", async () => {
    const store = connectedStore(stores);
    const recipient = "0x2222222222222222222222222222222222222222";
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      const result = ({ eth_getTransactionCount: "0x0", eth_maxPriorityFeePerGas: "0x0", eth_getBlockByNumber: { baseFeePerGas: "0x0" }, eth_estimateGas: "0x5208" } as Record<string, unknown>)[request.method];
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    }));
    const adapter = new MainnetAdapter(store, { POLYGON: ["https://polygon.example"] });
    const intent = { network: "POLYGON", chainId: 137, token: "POL", recipient, amountBaseUnits: "1000000000000000000" } as never;
    const tx = await adapter.buildTransferTransaction("demo-user-001", intent);
    expect(tx).toMatchObject({ to: recipient, data: "0x", value: "0xde0b6b3a7640000" });
  });

  it("broadcasts a Vault-signed raw transaction and reports the explorer link", async () => {
    const store = connectedStore(stores);
    const hash = `0x${"a".repeat(64)}`;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      expect(request.method).toBe("eth_sendRawTransaction");
      expect(request.params[0]).toBe("0xdeadbeef");
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: hash }) } as Response;
    }));
    const adapter = new MainnetAdapter(store, { POLYGON: ["https://polygon.example"] });
    const result = await adapter.broadcastRawTransaction("POLYGON", "0xdeadbeef");
    expect(result).toMatchObject({ status: "PENDING", transactionHash: hash, explorerUrl: `https://polygonscan.com/tx/${hash}` });
  });

  it("rejects a malformed signed transaction before broadcasting", async () => {
    const store = connectedStore(stores);
    const adapter = new MainnetAdapter(store);
    await expect(adapter.broadcastRawTransaction("POLYGON", "not-hex")).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });
});
