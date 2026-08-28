import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS,
  type Balance, type LiveNetworkSpec, type NetworkId, type PaymentIntent,
  type TransactionRecord, type UnsignedEvmTransaction, type UnsignedWalletTransaction, type WalletSummary
} from "@aifinpay/shared";
import { keccak256 } from "viem";
import type { Store } from "../storage/store.js";
import { UniversalMainnetAdapter } from "./universal-mainnet-adapter.js";

interface RpcEnvelope<T> { result?: T; error?: { code: number; message: string } }
const RPC_TIMEOUT_MS = 5_000;
const toHexQuantity = (value: bigint): string => `0x${value.toString(16)}`;

function specFor(network: NetworkId): LiveNetworkSpec {
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new AppError("NETWORK_UNSUPPORTED", `${network} is not a supported live network.`);
  return spec;
}

/**
 * Adds one fail-closed capability to the existing universal adapter: an exact,
 * independently pinned AIFP-1 v1.3 EVM contract call. Ordinary transfers and
 * all non-EVM chain behavior remain delegated unchanged.
 */
export class Aifp1AwareMainnetAdapter implements WalletAdapter {
  readonly kind = "MAINNET" as const;
  private readonly base: UniversalMainnetAdapter;
  private rpcId = 0;

  constructor(
    private readonly store: Store,
    private readonly rpcOverrides: Record<string, string[]> = {},
    private readonly rpcAuth: Record<string, string> = {}
  ) {
    this.base = new UniversalMainnetAdapter(store, rpcOverrides, rpcAuth);
  }

  getWalletSummary(userId: string, network?: NetworkId): Promise<WalletSummary> {
    return this.base.getWalletSummary(userId, network);
  }

  getBalance(userId: string, token: "USDC" | "POL", network: NetworkId): Promise<Balance> {
    return this.base.getBalance(userId, token, network);
  }

  listTransactions(userId: string): Promise<TransactionRecord[]> {
    return this.base.listTransactions(userId);
  }

  execute(intent: PaymentIntent): Promise<ExecutionResult> {
    return this.base.execute(intent);
  }

  getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null> {
    return this.base.getTransactionStatus(transactionHash);
  }

  async buildTransferTransaction(userId: string, intent: PaymentIntent): Promise<UnsignedWalletTransaction> {
    if (!intent.contractCall) return this.base.buildTransferTransaction(userId, intent);
    return this.buildAifp1ContractCall(userId, intent);
  }

  broadcastRawTransaction(network: NetworkId, rawTransaction: string): Promise<ExecutionResult> {
    return this.base.broadcastRawTransaction(network, rawTransaction);
  }

  private rpcUrls(network: NetworkId): string[] {
    const override = this.rpcOverrides[network];
    return override && override.length ? override : [...specFor(network).rpcUrls];
  }

  private headers(network: NetworkId): Record<string, string> {
    const auth = this.rpcAuth[network];
    return { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) };
  }

  private async rpc<T>(network: NetworkId, method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.rpcUrls(network)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.headers(network),
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.rpcId, method, params }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const body = await response.json() as RpcEnvelope<T>;
        if (body.error || body.result === undefined) throw new Error(body.error?.message ?? "Malformed RPC response");
        return body.result;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", `${specFor(network).label} RPC is temporarily unavailable.`, 503);
  }

  private async buildAifp1ContractCall(userId: string, intent: PaymentIntent): Promise<UnsignedEvmTransaction> {
    const call = intent.contractCall;
    if (!call) throw new AppError("SIGNING_FAILED", "AIFP-1 contract call metadata is missing.", 403);
    const spec = specFor(intent.network);
    if (spec.family !== "EVM" || !spec.chainId || spec.chainId !== intent.chainId) {
      throw new AppError("SIGNING_FAILED", "The AIFP-1 route does not match the selected EVM chain.", 403);
    }
    if (call.kind !== "AIFP1_V13_NATIVE" || call.routeClass !== "merchant-aifp1" || call.splitterVersion !== "1.3" || call.economicsProfile !== "AIFP-1:100/0:gross") {
      throw new AppError("SIGNING_FAILED", "The AIFP-1 settlement profile is not trusted.", 403);
    }
    if (call.contract.toLowerCase() !== intent.recipient.toLowerCase() || call.data.slice(0, 10).toLowerCase() !== call.selector.toLowerCase()) {
      throw new AppError("SIGNING_FAILED", "The stored AIFP-1 transaction was mutated before signing.", 403);
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (call.validUntil <= nowSeconds || new Date(intent.expiresAt).getTime() <= Date.now()) {
      throw new AppError("QUOTE_EXPIRED", "The AIFP-1 settlement quote expired before signing.", 410);
    }

    const connection = this.store.getWalletConnection(userId);
    const from = connection?.addresses.evm;
    if (!from || !/^0x[0-9a-fA-F]{40}$/.test(from)) throw new AppError("WALLET_NOT_FOUND", "Connect your EVM wallet before signing.", 404);
    const to = call.contract.toLowerCase();
    const data = call.data.toLowerCase();
    const value = BigInt(call.valueBaseUnits);
    if (value <= 0n || value !== BigInt(intent.amountBaseUnits)) {
      throw new AppError("INVALID_AMOUNT", "The AIFP-1 settlement value no longer matches the prepared intent.");
    }

    const [runtimeCode, nonceHex, priorityHex, latestBlock, nativeBalanceHex] = await Promise.all([
      this.rpc<string>(intent.network, "eth_getCode", [to, "latest"]),
      this.rpc<string>(intent.network, "eth_getTransactionCount", [from, "pending"]),
      this.rpc<string>(intent.network, "eth_maxPriorityFeePerGas", []).catch(() => "0x3b9aca00"),
      this.rpc<{ baseFeePerGas?: string }>(intent.network, "eth_getBlockByNumber", ["latest", false]),
      this.rpc<string>(intent.network, "eth_getBalance", [from, "pending"])
    ]);
    if (!/^0x[0-9a-fA-F]+$/.test(runtimeCode) || runtimeCode === "0x") {
      throw new AppError("SIGNING_FAILED", "The trusted AIFP-1 contract has no runtime bytecode on this chain.", 403);
    }
    const actualRuntimeHash = keccak256(runtimeCode as `0x${string}`).toLowerCase();
    if (actualRuntimeHash !== call.runtimeCodeHash.toLowerCase()) {
      throw new AppError("SIGNING_FAILED", "The AIFP-1 contract runtime hash does not match the wallet trust pin.", 403);
    }

    const baseFee = BigInt(latestBlock.baseFeePerGas ?? "0x0");
    const priorityFee = BigInt(priorityHex);
    const maxFee = baseFee * 2n + priorityFee;
    const estimatedGasHex = await this.rpc<string>(intent.network, "eth_estimateGas", [{ from, to, value: toHexQuantity(value), data }]);
    const estimatedGas = BigInt(estimatedGasHex);
    const gasWithBuffer = estimatedGas + estimatedGas / 5n;
    const maximumGasCost = gasWithBuffer * maxFee;
    if (BigInt(nativeBalanceHex) < value + maximumGasCost) {
      throw new AppError("INSUFFICIENT_FUNDS", `Insufficient ${spec.native.symbol} for the AIFP-1 gross amount and maximum network fee.`);
    }

    return {
      kind: "EVM",
      to,
      value: toHexQuantity(value),
      data,
      nonce: Number(BigInt(nonceHex)),
      gas: toHexQuantity(gasWithBuffer),
      maxFeePerGas: toHexQuantity(maxFee),
      maxPriorityFeePerGas: toHexQuantity(priorityFee),
      chainId: spec.chainId
    };
  }
}
