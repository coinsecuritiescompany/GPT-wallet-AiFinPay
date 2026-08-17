import { createPublicClient, http, type Address } from "viem";
import {
  LIVE_NETWORKS,
  canonicalSettlementAsset,
  solanaAssociatedTokenAddress,
  type AiFinPayMainnet,
  type LiveNetworkSpec,
  type NetworkId,
  type TreasurySourceAsset,
} from "@aifinpay/shared";
import type { TreasuryAddressPins } from "../config.js";

const ERC20_ABI = [{
  type: "function", name: "balanceOf", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }]
}] as const;

export const TREASURY_NETWORK_ID: Record<AiFinPayMainnet, NetworkId> = {
  polygon: "POLYGON", avalanche: "AVALANCHE", arbitrum: "ARBITRUM", bnb: "BNB", base: "BASE",
  unichain: "UNICHAIN", optimism: "OPTIMISM", botchain: "BOTCHAIN", xrplevm: "XRPLEVM",
  solana: "SOLANA", near: "NEAR", aptos: "APTOS", casper: "CASPER"
};

export interface TreasuryBalance {
  network: AiFinPayMainnet;
  address: string;
  asset: TreasurySourceAsset;
  symbol: string;
  raw: bigint;
  decimals: number;
  tokenAddress: string | null;
  observedAt: string;
}

function specFor(network: AiFinPayMainnet): LiveNetworkSpec {
  const id = TREASURY_NETWORK_ID[network];
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[id];
  if (!spec) throw new Error(`Missing live-network metadata for ${network}`);
  return spec;
}

function rpcUrls(network: AiFinPayMainnet, overrides: Record<string, string[]>): string[] {
  const id = TREASURY_NETWORK_ID[network];
  const configured = overrides[id];
  if (configured?.length) return configured;
  return [...specFor(network).rpcUrls];
}

function rpcHeaders(network: AiFinPayMainnet, auth: Record<string, string>): Record<string, string> {
  const token = auth[TREASURY_NETWORK_ID[network]];
  return { "content-type": "application/json", ...(token ? { authorization: token } : {}) };
}

async function jsonRpc<T>(
  network: AiFinPayMainnet,
  urls: string[],
  headers: Record<string, string>,
  method: string,
  params: unknown,
): Promise<T> {
  let lastError: unknown;
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json() as { result?: T; error?: { message?: string } };
      if (body.result === undefined || body.error) throw new Error(body.error?.message ?? "Malformed RPC response");
      return body.result;
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
  }
  throw new Error(`${network} RPC unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function restGet<T>(urls: string[], path: string): Promise<T | null> {
  let lastError: unknown;
  for (const base of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { signal: controller.signal });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`REST HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) { lastError = error; }
    finally { clearTimeout(timeout); }
  }
  throw new Error(`REST endpoint unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export class TreasuryBalanceReader {
  constructor(
    private readonly addresses: TreasuryAddressPins,
    private readonly rpcOverrides: Record<string, string[]> = {},
    private readonly rpcAuth: Record<string, string> = {},
  ) {}

  async read(network: AiFinPayMainnet, asset: TreasurySourceAsset): Promise<TreasuryBalance> {
    const address = this.addresses[network];
    if (!address) throw new Error(`Local treasury address is not pinned for ${network}`);
    if (asset !== "NATIVE") return this.readStable(network, address, asset);
    const spec = specFor(network);
    const urls = rpcUrls(network, this.rpcOverrides);
    const headers = rpcHeaders(network, this.rpcAuth);
    let raw: bigint;
    switch (spec.family) {
      case "EVM": {
        const client = createPublicClient({ transport: http(urls[0], { timeout: 6_000, fetchOptions: { headers } }) });
        raw = await client.getBalance({ address: address as Address, blockTag: "latest" });
        break;
      }
      case "SOLANA": {
        const result = await jsonRpc<{ value: number }>(network, urls, headers, "getBalance", [address, { commitment: "confirmed" }]);
        raw = BigInt(result.value ?? 0);
        break;
      }
      case "NEAR": {
        const result = await jsonRpc<{ amount: string }>(network, urls, headers, "query", {
          request_type: "view_account", finality: "final", account_id: address,
        });
        raw = BigInt(result.amount ?? "0");
        break;
      }
      case "APTOS": {
        const result = await restGet<{ data: { coin: { value: string } } }>(
          urls, `/accounts/${address}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`,
        );
        raw = BigInt(result?.data.coin.value ?? "0");
        break;
      }
      case "CASPER": {
        const result = await jsonRpc<{ balance: string }>(network, urls, headers, "query_balance", {
          purse_identifier: { main_purse_under_public_key: address },
        }).catch((error) => {
          if (/purse|account|not found|valuenotfound|failed to get/i.test(String(error))) return { balance: "0" };
          throw error;
        });
        raw = BigInt(result.balance ?? "0");
        break;
      }
      default:
        throw new Error(`Unsupported treasury family for ${network}`);
    }
    return {
      network, address, asset, symbol: spec.native.symbol, raw, decimals: spec.native.decimals,
      tokenAddress: null, observedAt: new Date().toISOString(),
    };
  }

  private async readStable(
    network: AiFinPayMainnet,
    address: string,
    asset: "USDC" | "USDT",
  ): Promise<TreasuryBalance> {
    const canonical = canonicalSettlementAsset(network, asset);
    if (!canonical) throw new Error(`${asset} on ${network} is not an approved AiFinPay settlement asset`);
    const urls = rpcUrls(network, this.rpcOverrides);
    const headers = rpcHeaders(network, this.rpcAuth);
    const observedAt = new Date().toISOString();
    if (network === "solana") {
      const ata = solanaAssociatedTokenAddress(address, canonical.address);
      const result = await jsonRpc<{ value?: { amount?: string; decimals?: number } }>(
        network, urls, headers, "getTokenAccountBalance", [ata, { commitment: "confirmed" }],
      ).catch((error) => {
        if (/could not find account|Invalid param/i.test(String(error))) return { value: undefined };
        throw error;
      });
      const actualDecimals = result.value?.decimals ?? canonical.decimals;
      if (actualDecimals !== canonical.decimals) throw new Error(`${asset} Solana decimals mismatch`);
      return {
        network, address, asset, symbol: asset, raw: BigInt(result.value?.amount ?? "0"),
        decimals: canonical.decimals, tokenAddress: canonical.address, observedAt,
      };
    }
    if (specFor(network).family !== "EVM") {
      throw new Error(`${network} current AiFinPay settlement treasury path is native-only`);
    }
    const client = createPublicClient({ transport: http(urls[0], { timeout: 6_000, fetchOptions: { headers } }) });
    const raw = await client.readContract({
      address: canonical.address as Address, abi: ERC20_ABI, functionName: "balanceOf", args: [address as Address],
    });
    return {
      network, address, asset, symbol: asset, raw, decimals: canonical.decimals,
      tokenAddress: canonical.address, observedAt,
    };
  }
}
