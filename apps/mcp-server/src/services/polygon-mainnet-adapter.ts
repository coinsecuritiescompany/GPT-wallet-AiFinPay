import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, TOKENS, formatBaseUnits,
  type Balance, type NetworkId, type PaymentIntent, type TransactionRecord, type WalletSummary
} from "@aifinpay/shared";
import type { Store } from "../storage/store.js";

interface RpcEnvelope<T> { result?: T; error?: { code: number; message: string } }

export class PolygonMainnetAdapter implements WalletAdapter {
  readonly kind = "MAINNET" as const;
  private rpcId = 0;
  private readonly cache = new Map<string, { expiresAt: number; value: Balance }>();

  constructor(private readonly store: Store, private readonly rpcUrls: string[]) {
    if (!rpcUrls.length) throw new Error("At least one Polygon RPC URL is required");
  }

  private addressFor(userId: string): string {
    const address = this.store.getWalletConnection(userId)?.addresses.evm;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new AppError("WALLET_NOT_FOUND", "Connect your AiFinPay Vault before loading mainnet balances.", 404);
    }
    return address;
  }

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    let lastError: unknown;
    for (const url of this.rpcUrls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
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
    throw new AppError("RPC_UNAVAILABLE", "Polygon mainnet RPC is temporarily unavailable. Try again shortly.", 503);
  }

  async getWalletSummary(userId: string, network: NetworkId = "POLYGON"): Promise<WalletSummary> {
    if (network !== "POLYGON") throw new AppError("NETWORK_UNSUPPORTED", "This live deployment currently supports Polygon mainnet.");
    const address = this.addressFor(userId);
    const balances = await Promise.all([
      this.getBalance(userId, "USDC", network),
      this.getBalance(userId, "POL", network)
    ]);
    return {
      walletId: `polygon:${address.toLowerCase()}`,
      address,
      maskedAddress: `${address.slice(0, 8)}…${address.slice(-6)}`,
      selectedNetwork: "POLYGON",
      balances,
      latestTransactions: [],
      activeAgentPolicies: [],
      mode: "MAINNET"
    };
  }

  async getBalance(userId: string, token: "USDC" | "POL", network: NetworkId): Promise<Balance> {
    if (network !== "POLYGON") throw new AppError("NETWORK_UNSUPPORTED", "This live deployment currently supports Polygon mainnet.");
    const address = this.addressFor(userId);
    const key = `${address.toLowerCase()}:${token}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const rawHex = token === "POL"
      ? await this.rpc<string>("eth_getBalance", [address, "latest"])
      : await this.rpc<string>("eth_call", [{
          to: TOKENS.USDC.address,
          data: `0x70a08231${address.slice(2).padStart(64, "0")}`
        }, "latest"]);
    const raw = BigInt(rawHex);
    const decimals = token === "USDC" ? 6 : 18;
    const value: Balance = {
      token,
      raw: raw.toString(),
      formatted: formatBaseUnits(raw, decimals, token === "USDC" ? 2 : 5),
      decimals
    };
    this.cache.set(key, { expiresAt: Date.now() + 15_000, value });
    return value;
  }

  async listTransactions(userId: string): Promise<TransactionRecord[]> {
    this.addressFor(userId);
    return [];
  }

  async execute(_intent: PaymentIntent): Promise<ExecutionResult> {
    void _intent;
    throw new AppError("SIGNING_FAILED", "Mainnet broadcasting is locked until per-user authentication and local Vault signing are enabled.", 501);
  }

  async getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null> {
    const receipt = await this.rpc<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [transactionHash]);
    if (!receipt) return null;
    const confirmed = receipt.status === "0x1";
    return {
      status: confirmed ? "CONFIRMED" : "FAILED",
      transactionHash,
      explorerUrl: `https://polygonscan.com/tx/${transactionHash}`,
      receiptId: `polygon:${receipt.blockNumber}`,
      confirmations: confirmed ? 1 : 0
    };
  }
}
