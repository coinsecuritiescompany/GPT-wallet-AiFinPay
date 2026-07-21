import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS, formatBaseUnits,
  type AddressFamily, type Balance, type LiveNetworkSpec, type NetworkId,
  type PaymentIntent, type TransactionRecord, type UnsignedEvmTransaction, type WalletSummary
} from "@aifinpay/shared";
import type { Store } from "../storage/store.js";

interface RpcEnvelope<T> { result?: T; error?: { code: number; message: string } }

const BALANCE_OF_SELECTOR = "0x70a08231";
// ERC-20 transfer(address,uint256).
const TRANSFER_SELECTOR = "0xa9059cbb";
const CACHE_TTL_MS = 15_000;
const RPC_TIMEOUT_MS = 4_000;

const toHexQuantity = (value: bigint): string => `0x${value.toString(16)}`;

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
    // Casper account public key: 01 + 64 hex (ed25519) or 02 + 66 hex (secp256k1).
    if (family === "casper" && /^0(1[0-9a-fA-F]{64}|2[0-9a-fA-F]{66})$/.test(address)) return address;
  }
  throw new AppError("WALLET_NOT_FOUND", "Connect your AiFinPay Vault before loading mainnet balances.", 404);
}

/**
 * Mainnet adapter. Loads live public-chain balances for the connected AiFinPay
 * Vault across all 13 mainnet networks (9 EVM chains + Solana, NEAR, Aptos,
 * Casper). Custodial `execute` stays permanently locked — the server never holds
 * a key. EVM sending is non-custodial: `buildTransferTransaction` prepares the
 * unsigned tx, the Vault signs it on the device, and `broadcastRawTransaction`
 * publishes the finished raw tx. Both are gated per-network by config.
 */
export class MainnetAdapter implements WalletAdapter {
  readonly kind = "MAINNET" as const;
  private rpcId = 0;
  private readonly cache = new Map<string, { expiresAt: number; value: Balance }>();

  constructor(
    private readonly store: Store,
    private readonly rpcOverrides: Record<string, string[]> = {},
    private readonly rpcAuth: Record<string, string> = {}
  ) {}

  private rpcUrls(network: NetworkId): string[] {
    const override = this.rpcOverrides[network];
    return override && override.length ? override : [...specFor(network).rpcUrls];
  }

  private addressFor(userId: string, family: AddressFamily): string {
    const addresses = this.store.getWalletConnection(userId)?.addresses;
    return assertAddress(family, addresses?.[family]);
  }

  /** Authorization header for key-gated nodes (e.g. Casper mainnet), if configured. */
  private authHeaders(network: NetworkId): Record<string, string> {
    const auth = this.rpcAuth[network];
    return auth ? { authorization: auth } : {};
  }

  /** Minimal JSON-RPC POST helper with multi-endpoint failover (EVM, Solana, NEAR, Casper). */
  private async rpc<T>(network: NetworkId, method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.rpcUrls(network)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...this.authHeaders(network) },
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
      case "CASPER":
        return this.readCasper(network, address);
      default:
        throw new AppError("NETWORK_UNSUPPORTED", `${spec.label} is not a supported live network.`);
    }
  }

  /**
   * Casper native (CSPR) balance via the query_balance JSON-RPC method, keyed on
   * the account's main purse under its public key. An unfunded account has no
   * purse yet — that is a zero balance, not an outage — so purse/account "not
   * found" errors resolve to 0 while genuine transport failures fail over.
   */
  private async readCasper(network: NetworkId, publicKey: string): Promise<bigint> {
    const params = { purse_identifier: { main_purse_under_public_key: publicKey } };
    let lastError: unknown;
    for (const url of this.rpcUrls(network)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...this.authHeaders(network) },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++this.rpcId, method: "query_balance", params }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const payload = await response.json() as RpcEnvelope<{ balance: string }>;
        if (payload.result?.balance !== undefined) return BigInt(payload.result.balance);
        const message = payload.error?.message ?? "Malformed RPC response";
        if (/purse|account|not found|valuenotfound|failed to get/i.test(message)) return 0n; // unfunded
        throw new Error(message);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", `${specFor(network).label} RPC is temporarily unavailable. Try again shortly.`, 503);
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
    // Fetch balances and live Polygon history in parallel (history is Blockscout,
    // Polygon-only for now; other networks return no history rather than wrong data).
    const [balances, latestTransactions] = await Promise.all([
      Promise.all(tokenSlots.map((slot) => this.getBalance(userId, slot, network))),
      network === "POLYGON" ? this.listTransactions(userId) : Promise.resolve<TransactionRecord[]>([])
    ]);
    return {
      walletId: `${network.toLowerCase()}:${address.toLowerCase()}`,
      address,
      maskedAddress: `${address.slice(0, 8)}…${address.slice(-6)}`,
      selectedNetwork: network,
      balances,
      latestTransactions,
      activeAgentPolicies: [],
      mode: "MAINNET"
    };
  }

  async listTransactions(userId: string): Promise<TransactionRecord[]> {
    const address = this.addressFor(userId, "evm");
    const lower = address.toLowerCase();
    const query = `module=account&action=txlist&address=${address}&sort=desc&page=1&offset=25`;
    const key = process.env.ETHERSCAN_API_KEY?.trim();
    // Etherscan V2 (fast, reliable) when a key is configured; Blockscout is a
    // keyless best-effort fallback (slower and occasionally flaky). Any failure
    // degrades to an empty list so the wallet still renders quickly.
    const sources: Array<{ url: string; timeout: number }> = [
      ...(key ? [{ url: `https://api.etherscan.io/v2/api?chainid=137&${query}&apikey=${key}`, timeout: 6_000 }] : []),
      { url: `https://polygon.blockscout.com/api?${query}`, timeout: RPC_TIMEOUT_MS }
    ];
    for (const source of sources) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), source.timeout);
      try {
        const response = await fetch(source.url, { signal: controller.signal });
        if (!response.ok) continue;
        const body = await response.json() as { status?: string; result?: Array<{ hash: string; to: string | null; from: string; value: string; timeStamp: string; isError?: string; txreceipt_status?: string }> };
        if (body.status !== "1" || !Array.isArray(body.result)) continue;
        return body.result
          .filter((tx) => tx.value && tx.value !== "0")
          .slice(0, 20)
          .map((tx): TransactionRecord => {
            const failed = tx.isError === "1" || tx.txreceipt_status === "0";
            return {
              id: tx.hash,
              timestamp: new Date(Number(tx.timeStamp) * 1000).toISOString(),
              direction: tx.to?.toLowerCase() === lower ? "IN" : "OUT",
              token: "POL",
              amount: formatBaseUnits(tx.value, 18, 6),
              amountBaseUnits: tx.value,
              network: "POLYGON",
              status: failed ? "FAILED" : "CONFIRMED",
              recipient: tx.to ?? "",
              initiatedByType: "USER",
              initiatedById: "user",
              policyDecision: "AUTO_APPROVED",
              transactionHash: tx.hash,
              auditReceiptId: tx.hash
            };
          });
      } catch {
        continue;
      } finally {
        clearTimeout(timeout);
      }
    }
    return [];
  }

  async execute(_intent: PaymentIntent): Promise<ExecutionResult> {
    void _intent;
    // Server-side custodial execution stays permanently locked: the server never
    // holds a key. Sending goes through the non-custodial pair below — the Vault
    // signs on the device and the server only broadcasts the finished raw tx.
    throw new AppError("SIGNING_FAILED", "Server-side signing is disabled by design. AiFinPay is non-custodial — the Vault signs on your device.", 501);
  }

  /**
   * Build the exact EIP-1559 fields for a native or USDC transfer so the Vault
   * can sign them locally. Nonce, gas and fees are read live from the network;
   * the private key is never involved here — only public reads plus the intent's
   * recipient/amount. The Vault re-derives the sender from its own key, so the
   * returned tx has no `from` field to trust.
   */
  async buildTransferTransaction(userId: string, intent: PaymentIntent): Promise<UnsignedEvmTransaction> {
    const network = intent.network;
    const spec = specFor(network);
    if (spec.family !== "EVM") throw new AppError("SIGNING_FAILED", `Local signing is not available on ${spec.label} yet.`, 501);
    const from = this.addressFor(userId, "evm");
    const amount = BigInt(intent.amountBaseUnits);
    if (amount <= 0n) throw new AppError("INVALID_AMOUNT", "Transfer amount must be greater than zero.");
    assertAddress("evm", intent.recipient);

    let to: string;
    let value: bigint;
    let data: string;
    if (intent.token === "USDC") {
      if (!spec.usdc) throw new AppError("TOKEN_UNSUPPORTED", `USDC transfers are not available on ${spec.label}.`);
      to = spec.usdc.address;
      value = 0n;
      data = `${TRANSFER_SELECTOR}${intent.recipient.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
    } else {
      to = intent.recipient;
      value = amount;
      data = "0x";
    }

    const [nonceHex, priorityHex, latestBlock] = await Promise.all([
      this.rpc<string>(network, "eth_getTransactionCount", [from, "pending"]),
      this.rpc<string>(network, "eth_maxPriorityFeePerGas", []).catch(() => "0x3b9aca00"), // 1 gwei fallback
      this.rpc<{ baseFeePerGas?: string }>(network, "eth_getBlockByNumber", ["latest", false])
    ]);
    const baseFee = BigInt(latestBlock.baseFeePerGas ?? "0x0");
    const priorityFee = BigInt(priorityHex);
    // Head-room for one base-fee step up between build and inclusion.
    const maxFee = baseFee * 2n + priorityFee;

    const estimatedGas = await this.rpc<string>(network, "eth_estimateGas", [{ from, to, value: toHexQuantity(value), data }])
      .then((hex) => BigInt(hex))
      .catch(() => (intent.token === "USDC" ? 90_000n : 21_000n));
    const gasWithBuffer = estimatedGas + estimatedGas / 5n; // +20%

    return {
      to,
      value: toHexQuantity(value),
      data,
      nonce: Number(BigInt(nonceHex)),
      gas: toHexQuantity(gasWithBuffer),
      maxFeePerGas: toHexQuantity(maxFee),
      maxPriorityFeePerGas: toHexQuantity(priorityFee),
      chainId: spec.chainId ?? intent.chainId
    };
  }

  /** Broadcast a Vault-signed raw transaction and report the resulting hash. */
  async broadcastRawTransaction(network: NetworkId, rawTransaction: string): Promise<ExecutionResult> {
    const spec = specFor(network);
    if (spec.family !== "EVM") throw new AppError("SIGNING_FAILED", `Broadcasting is not available on ${spec.label} yet.`, 501);
    if (!/^0x[0-9a-fA-F]+$/.test(rawTransaction)) throw new AppError("SIGNING_FAILED", "Signed transaction is malformed.");
    const hash = await this.rpc<string>(network, "eth_sendRawTransaction", [rawTransaction]);
    return {
      status: "PENDING",
      transactionHash: hash,
      explorerUrl: `${spec.explorerBaseUrl}/tx/${hash}`,
      receiptId: `${network.toLowerCase()}:${hash}`,
      confirmations: 0
    };
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
