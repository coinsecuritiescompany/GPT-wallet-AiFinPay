import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS, formatBaseUnits,
  type AddressFamily, type Balance, type LiveNetworkSpec, type NetworkId,
  type PaymentIntent, type TransactionRecord, type WalletSummary
} from "@aifinpay/shared";
import type { Store } from "../storage/store.js";

interface RpcEnvelope<T> { result?: T; error?: { code: number; message: string } }

const BALANCE_OF_SELECTOR = "0x70a08231";
const CACHE_TTL_MS = 15_000;
const RPC_TIMEOUT_MS = 4_000;

function specFor(network: NetworkId): LiveNetworkSpec {
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new AppError("NETWORK_UNSUPPORTED", `${network} is not a supported live network.`);
  return spec;
}

function assertAddress(family: AddressFamily, address: string | undefined): string {
  if (address) {
    if (family === "evm" && /^0x[a-fA-F0-9]{40}$/.test(address)) return address;
    if (family === "solana" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return address;
    if (family === "near" && (/^[0-9a-f]{64}$/.test(address) || /^[a-z0-9._-]{2,64}$/.test(address))) return address;
    if (family === "aptos" && /^0x[a-fA-F0-9]{1,64}$/.test(address)) return address;
  }
  throw new AppError("WALLET_NOT_FOUND", "Connect your AiFinPay Vault before loading mainnet balances.", 404);
}

/**
 * Read-only mainnet adapter. Loads live public-chain balances for the connected
 * AiFinPay Vault across all 12 mainnet networks (9 EVM chains + Solana, NEAR,
 * Aptos). Signing and broadcasting remain deliberately disabled — `execute`
 * always fails closed.
 */
export class MainnetAdapter implements WalletAdapter {
  readonly kind = "MAINNET" as const;
  private rpcId = 0;
  private readonly cache = new Map<string, { expiresAt: number; value: Balance }>();

  constructor(private readonly store: Store, private readonly rpcOverrides: Record<string, string[]> = {}) {}

  private rpcUrls(network: NetworkId): string[] {
    const override = this.rpcOverrides[network];
    return override && override.length ? override : [...specFor(network).rpcUrls];
  }

  private addressFor(userId: string, family: AddressFamily): string {
    const addresses = this.store.getWalletConnection(userId)?.addresses;
    return assertAddress(family, addresses?.[family]);
  }

  /** Minimal JSON-RPC POST helper with multi-endpoint failover (EVM, Solana, NEAR). */
  private async rpc<T>(network: NetworkId, method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.rpcUrls(network)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.rpcId, method, params }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const payload = await response.json() as RpcEnvelope<T>;
        if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? "Malformed RPC response");
        return payload.result;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", `${specFor(network).label} RPC is temporarily unavailable. Try again shortly.`, 503);
  }

  /** REST GET helper for Aptos fullnode reads with endpoint failover. */
  private async restGet<T>(network: NetworkId, path: string): Promise<T | null> {
    let lastError: unknown;
    for (const base of this.rpcUrls(network)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { signal: controller.signal });
        if (response.status === 404) return null; // resource absent = zero balance
        if (!response.ok) throw new Error(`REST HTTP ${response.status}`);
        return await response.json() as T;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", `${specFor(network).label} RPC is temporarily unavailable. Try again shortly.`, 503);
  }

  private async readNative(network: NetworkId, spec: LiveNetworkSpec, address: string): Promise<bigint> {
    switch (spec.family) {
      case "EVM":
        return BigInt(await this.rpc<string>(network, "eth_getBalance", [address, "latest"]));
      case "SOLANA": {
        const res = await this.rpc<{ value: number }>(network, "getBalance", [address]);
        return BigInt(res.value ?? 0);
      }
      case "NEAR": {
        const res = await this.rpc<{ amount: string }>(network, "query", {
          request_type: "view_account", finality: "final", account_id: address
        });
        return BigInt(res.amount ?? "0");
      }
      case "APTOS": {
        const res = await this.restGet<{ data: { coin: { value: string } } }>(
          network, `/accounts/${address}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`
        );
        return BigInt(res?.data.coin.value ?? "0");
      }
      default:
        throw new AppError("NETWORK_UNSUPPORTED", `${spec.label} is not a supported live network.`);
    }
  }

  private async readUsdc(network: NetworkId, spec: LiveNetworkSpec, address: string): Promise<bigint> {
    if (!spec.usdc) throw new AppError("TOKEN_UNSUPPORTED", `USDC is not available on ${spec.label} in this deployment.`);
    if (spec.family !== "EVM") throw new AppError("TOKEN_UNSUPPORTED", `USDC reads on ${spec.label} are not enabled in this deployment.`);
    const data = `${BALANCE_OF_SELECTOR}${address.slice(2).padStart(64, "0")}`;
    return BigInt(await this.rpc<string>(network, "eth_call", [{ to: spec.usdc.address, data }, "latest"]));
  }

  async getBalance(userId: string, token: "USDC" | "POL", network: NetworkId = "POLYGON"): Promise<Balance> {
    const spec = specFor(network);
    const address = this.addressFor(userId, spec.addressField);
    const key = `${network}:${address.toLowerCase()}:${token}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let raw: bigint;
    let symbol: string;
    let decimals: number;
    if (token === "USDC") {
      raw = await this.readUsdc(network, spec, address);
      symbol = "USDC";
      decimals = spec.usdc!.decimals;
    } else {
      raw = await this.readNative(network, spec, address);
      symbol = spec.native.symbol;
      decimals = spec.native.decimals;
    }
    const value: Balance = {
      token: symbol,
      raw: raw.toString(),
      formatted: formatBaseUnits(raw, decimals, token === "USDC" ? 2 : 5),
      decimals
    };
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

  async getWalletSummary(userId: string, network: NetworkId = "POLYGON"): Promise<WalletSummary> {
    const spec = specFor(network);
    const address = this.addressFor(userId, spec.addressField);
    const tokenSlots: Array<"USDC" | "POL"> = spec.usdc ? ["USDC", "POL"] : ["POL"];
    const balances = await Promise.all(tokenSlots.map((slot) => this.getBalance(userId, slot, network)));
    return {
      walletId: `${network.toLowerCase()}:${address.toLowerCase()}`,
      address,
      maskedAddress: `${address.slice(0, 8)}…${address.slice(-6)}`,
      selectedNetwork: network,
      balances,
      latestTransactions: [],
      activeAgentPolicies: [],
      mode: "MAINNET"
    };
  }

  async listTransactions(userId: string): Promise<TransactionRecord[]> {
    this.addressFor(userId, "evm");
    return [];
  }

  async execute(_intent: PaymentIntent): Promise<ExecutionResult> {
    void _intent;
    throw new AppError("SIGNING_FAILED", "Mainnet broadcasting is locked until per-user authentication and local Vault signing are enabled.", 501);
  }

  async getTransactionStatus(transactionHash: string, network: NetworkId = "POLYGON"): Promise<ExecutionResult | null> {
    const spec = specFor(network);
    if (spec.family !== "EVM") return null;
    const receipt = await this.rpc<{ status: string; blockNumber: string } | null>(network, "eth_getTransactionReceipt", [transactionHash]);
    if (!receipt) return null;
    const confirmed = receipt.status === "0x1";
    return {
      status: confirmed ? "CONFIRMED" : "FAILED",
      transactionHash,
      explorerUrl: `${spec.explorerBaseUrl}/tx/${transactionHash}`,
      receiptId: `${network.toLowerCase()}:${receipt.blockNumber}`,
      confirmations: confirmed ? 1 : 0
    };
  }
}
