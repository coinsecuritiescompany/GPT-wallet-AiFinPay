import { afterEach, describe, expect, it, vi } from "vitest";
import type { NetworkId, PaymentIntent } from "@aifinpay/shared";
import { Store } from "../src/storage/store.js";
import { MainnetAdapter } from "../src/services/mainnet-adapter.js";

const EVM_ADDRESS = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";
const SOLANA_ADDRESS = "So11111111111111111111111111111111111111112";
const NEAR_ADDRESS = "548178623b44c06b5312a415f260e5fe2a2a7c5cc5704b19cbee1d094e7b78eb";
const CASPER_ADDRESS = `01${"a".repeat(64)}`;

interface EvmCase {
  network: NetworkId;
  chainId: number;
  nativeSymbol: string;
  usdc?: { address: string; decimals: number };
}

const CASES: EvmCase[] = [
  { network: "POLYGON", chainId: 137, nativeSymbol: "POL", usdc: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 } },
  { network: "AVALANCHE", chainId: 43114, nativeSymbol: "AVAX", usdc: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 } },
  { network: "ARBITRUM", chainId: 42161, nativeSymbol: "ETH", usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 } },
  { network: "BNB", chainId: 56, nativeSymbol: "BNB", usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 } },
  { network: "BASE", chainId: 8453, nativeSymbol: "ETH", usdc: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } },
  { network: "UNICHAIN", chainId: 130, nativeSymbol: "ETH" },
  { network: "OPTIMISM", chainId: 10, nativeSymbol: "ETH", usdc: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 } }
];

function connectedStore(stores: Store[]): Store {
  const store = new Store(":memory:");
  stores.push(store);
  store.createWalletPairing("pair", "user-1", new Date(Date.now() + 60_000).toISOString());
  store.completeWalletPairing("pair", {
    evm: EVM_ADDRESS,
    solana: SOLANA_ADDRESS,
    near: NEAR_ADDRESS,
    aptos: "0x1",
    casper: CASPER_ADDRESS
  });
  return store;
}

function rpcMock() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    const result = ({
      eth_getTransactionCount: "0x7",
      eth_maxPriorityFeePerGas: "0x3b9aca00",
      eth_getBlockByNumber: { baseFeePerGas: "0x3b9aca00" },
      eth_estimateGas: "0x5208",
      eth_getBalance: "0x8ac7230489e80000",
      eth_call: "0x3635c9adc5dea00000"
    } as Record<string, unknown>)[request.method];
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
  });
}

function intent(network: NetworkId, token: "POL" | "USDC", amountBaseUnits: string): PaymentIntent {
  return {
    network,
    chainId: 0,
    token,
    recipient: RECIPIENT,
    amountBaseUnits
  } as unknown as PaymentIntent;
}

describe("direct signing configuration for production EVM mainnets", () => {
  const stores: Store[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    stores.splice(0).forEach((store) => store.close());
  });

  for (const current of CASES) {
    it(`builds a native ${current.nativeSymbol} transfer on ${current.network}`, async () => {
      const store = connectedStore(stores);
      vi.stubGlobal("fetch", rpcMock());
      const adapter = new MainnetAdapter(store, { [current.network]: [`https://${current.network.toLowerCase()}.example`] });

      const transaction = await adapter.buildTransferTransaction(
        "user-1",
        intent(current.network, "POL", "1000000000000000")
      );

      expect(transaction).toMatchObject({
        chainId: current.chainId,
        to: RECIPIENT,
        value: "0x38d7ea4c68000",
        data: "0x",
        nonce: 7,
        gas: "0x6270",
        maxPriorityFeePerGas: "0x3b9aca00",
        maxFeePerGas: "0xb2d05e00"
      });
    });

    if (current.usdc) {
      it(`uses the Obsidian USDC address and decimals on ${current.network}`, async () => {
        const store = connectedStore(stores);
        const fetchMock = rpcMock();
        vi.stubGlobal("fetch", fetchMock);
        const adapter = new MainnetAdapter(store, { [current.network]: [`https://${current.network.toLowerCase()}.example`] });
        const amount = 10n ** BigInt(current.usdc!.decimals);

        const transaction = await adapter.buildTransferTransaction(
          "user-1",
          intent(current.network, "USDC", amount.toString())
        );

        expect(transaction.to).toBe(current.usdc.address);
        expect(transaction.value).toBe("0x0");
        expect(transaction.chainId).toBe(current.chainId);
        expect(transaction.data.startsWith("0xa9059cbb")).toBe(true);
        expect(transaction.data).toContain(RECIPIENT.slice(2).padStart(64, "0"));
        expect(transaction.data.endsWith(amount.toString(16).padStart(64, "0"))).toBe(true);

        const calls = fetchMock.mock.calls
          .map((call) => JSON.parse(String(call[1]?.body)) as { method: string; params: Array<Record<string, string>> })
          .filter((call) => call.method === "eth_call");
        expect(calls.at(-1)?.params[0]?.to).toBe(current.usdc.address);
      });
    }
  }
});
