import { createHash } from "node:crypto";
import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS, attachCasperApproval, buildCasperTransferDeploy,
  buildNearTransferTransaction, encodeBase58, nearRpcPublicKey,
  type AptosUnsignedRequest, type Balance, type LiveNetworkSpec, type NetworkId,
  type PaymentIntent, type TransactionRecord, type UnsignedAptosTransaction,
  type UnsignedCasperTransaction, type UnsignedNearTransaction,
  type UnsignedWalletTransaction, type WalletSummary
} from "@aifinpay/shared";
import type { Store } from "../storage/store.js";
import { MainnetAdapter } from "./mainnet-adapter.js";

interface RpcEnvelope<T> { result?: T; error?: { code: number; message: string } }

const RPC_TIMEOUT_MS = 5_000;
const NEAR_FEE_RESERVE_YOCTO = 10_000_000_000_000_000_000_000n; // 0.01 NEAR
const APTOS_MAX_GAS_AMOUNT = 2_000n;
// A native CSPR transfer costs a flat 0.1 CSPR on Casper mainnet, and the
// network rejects a native transfer below 2.5 CSPR.
const CASPER_PAYMENT_MOTES = 100_000_000n;
const CASPER_MIN_TRANSFER_MOTES = 2_500_000_000n;
const CASPER_TTL_MS = 1_800_000;

function specFor(network: NetworkId): LiveNetworkSpec {
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new AppError("NETWORK_UNSUPPORTED", `${network} is not a supported live network.`);
  return spec;
}

function nearHash(transaction: Uint8Array): string {
  return encodeBase58(createHash("sha256").update(transaction).digest());
}

function normalizeAptosAddress(value: string): string {
  if (!/^0x[a-fA-F0-9]{1,64}$/.test(value)) throw new AppError("INVALID_ADDRESS", "Expected a valid Aptos address.");
  return `0x${value.slice(2).toLowerCase().padStart(64, "0")}`;
}

export class UniversalMainnetAdapter implements WalletAdapter {
  readonly kind = "MAINNET" as const;
  private rpcId = 0;
  private readonly base: MainnetAdapter;

  constructor(
    private readonly store: Store,
    private readonly rpcOverrides: Record<string, string[]> = {},
    private readonly rpcAuth: Record<string, string> = {}
  ) {
    this.base = new MainnetAdapter(store, rpcOverrides, rpcAuth);
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

  private rpcUrls(network: NetworkId): string[] {
    const override = this.rpcOverrides[network];
    return override && override.length ? override : [...specFor(network).rpcUrls];
  }

  private headers(network: NetworkId): Record<string, string> {
    const auth = this.rpcAuth[network];
    return { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) };
  }

  private address(userId: string, field: "near" | "aptos" | "casper"): string {
    const value = this.store.getWalletConnection(userId)?.addresses[field];
    if (!value) throw new AppError("WALLET_NOT_FOUND", `Connect your ${field.toUpperCase()} wallet before sending.`, 404);
    return value;
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

  private async aptosRequest<T>(path: string, init?: RequestInit): Promise<T> {
    let lastError: unknown;
    for (const base of this.rpcUrls("APTOS")) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
          ...init,
          headers: { ...this.headers("APTOS"), ...(init?.headers ?? {}) },
          signal: controller.signal
        });
        const body = await response.json().catch(() => null) as T | { message?: string } | null;
        if (!response.ok) throw new Error((body as { message?: string } | null)?.message ?? `REST HTTP ${response.status}`);
        return body as T;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", "Aptos fullnode is temporarily unavailable.", 503);
  }

  async buildTransferTransaction(userId: string, intent: PaymentIntent): Promise<UnsignedWalletTransaction> {
    if (intent.network === "NEAR") return this.buildNearTransfer(userId, intent);
    if (intent.network === "APTOS") return this.buildAptosTransfer(userId, intent);
    if (intent.network === "CASPER") return this.buildCasperTransfer(userId, intent);
    if (!this.base.buildTransferTransaction) throw new AppError("SIGNING_FAILED", "Signing is unavailable.", 501);
    return this.base.buildTransferTransaction(userId, intent);
  }

  private async buildCasperTransfer(userId: string, intent: PaymentIntent): Promise<UnsignedCasperTransaction> {
    if (intent.token === "USDC") {
      throw new AppError("TOKEN_UNSUPPORTED", "Casper has no canonical USDC; send native CSPR only.");
    }
    const sender = this.address(userId, "casper");
    if (!/^01[0-9a-f]{64}$/i.test(sender)) {
      throw new AppError("INVALID_ADDRESS", "The connected Casper account is invalid.");
    }
    const recipient = intent.recipient.trim();
    if (!/^(01[0-9a-f]{64}|02[0-9a-f]{66})$/i.test(recipient)) {
      throw new AppError("INVALID_ADDRESS",
        "Expected a Casper public key: 01 followed by 32 bytes (ed25519), or 02 followed by 33 bytes (secp256k1).");
    }
    if (recipient.toLowerCase() === sender.toLowerCase()) {
      throw new AppError("INVALID_ADDRESS", "The recipient is the sending account.");
    }
    const amount = BigInt(intent.amountBaseUnits);
    if (amount < CASPER_MIN_TRANSFER_MOTES) {
      throw new AppError("INVALID_AMOUNT", "Casper rejects native transfers below 2.5 CSPR.");
    }
    const balance = await this.base.getBalance(userId, "POL", "CASPER");
    if (BigInt(balance.raw) < amount + CASPER_PAYMENT_MOTES) {
      throw new AppError("INSUFFICIENT_FUNDS", "Insufficient CSPR for the transfer amount and its 0.1 CSPR fee.");
    }
    // The deploy commits to its own timestamp, so it is built once and signed
    // as-is; rebuilding it later would change the hash the user approved.
    const deploy = buildCasperTransferDeploy({
      senderPublicKeyHex: sender.toLowerCase(),
      recipientPublicKeyHex: recipient.toLowerCase(),
      amountMotes: amount,
      paymentMotes: CASPER_PAYMENT_MOTES,
      chainName: this.casperChainName(),
      timestampMs: Date.now(),
      ttlMs: CASPER_TTL_MS,
      id: null
    });
    return {
      kind: "CASPER",
      deployJson: deploy.deployJson,
      deployHashHex: deploy.deployHashHex,
      senderPublicKeyHex: sender.toLowerCase(),
      paymentMotes: CASPER_PAYMENT_MOTES.toString()
    };
  }

  /** Casper's chain name is part of the signed header, so it must be explicit. */
  private casperChainName(): string {
    const configured = process.env.CASPER_CHAIN_NAME?.trim();
    if (configured) return configured;
    const rpc = this.rpcUrls("CASPER")[0] ?? "";
    return /testnet/i.test(rpc) ? "casper-test" : "casper";
  }

  private async buildNearTransfer(userId: string, intent: PaymentIntent): Promise<UnsignedNearTransaction> {
    if (intent.token === "USDC") throw new AppError("TOKEN_UNSUPPORTED", "NEAR fungible-token sending is not enabled; send native NEAR only.");
    const signerId = this.address(userId, "near");
    if (!/^[0-9a-f]{64}$/.test(signerId)) throw new AppError("INVALID_ADDRESS", "The connected NEAR account is invalid.");
    const receiverId = intent.recipient;
    if (!/^[a-z0-9._-]{2,64}$/.test(receiverId)) throw new AppError("INVALID_ADDRESS", "Expected a valid NEAR account ID.");
    const amount = BigInt(intent.amountBaseUnits);
    if (amount <= 0n) throw new AppError("INVALID_AMOUNT", "Transfer amount must be greater than zero.");
    const publicKey = nearRpcPublicKey(signerId);
    const accessKey = await this.rpc<{ nonce: number | string; block_hash: string }>("NEAR", "query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: signerId,
      public_key: publicKey
    });
    const nonce = BigInt(accessKey.nonce) + 1n;
    const transaction = buildNearTransferTransaction(signerId, signerId, nonce, receiverId, accessKey.block_hash, amount);
    const balance = await this.base.getBalance(userId, "POL", "NEAR");
    if (BigInt(balance.raw) < amount + NEAR_FEE_RESERVE_YOCTO) {
      throw new AppError("INSUFFICIENT_FUNDS", "Insufficient NEAR for the transfer amount and a 0.01 NEAR fee reserve.");
    }
    return {
      kind: "NEAR",
      transactionBase64: Buffer.from(transaction).toString("base64"),
      transactionHash: nearHash(transaction),
      nonce: nonce.toString(),
      blockHash: accessKey.block_hash,
      feeReserveYocto: NEAR_FEE_RESERVE_YOCTO.toString()
    };
  }

  private async buildAptosTransfer(userId: string, intent: PaymentIntent): Promise<UnsignedAptosTransaction> {
    if (intent.token === "USDC") throw new AppError("TOKEN_UNSUPPORTED", "Aptos fungible-token sending is not enabled; send native APT only.");
    const sender = normalizeAptosAddress(this.address(userId, "aptos"));
    const recipient = normalizeAptosAddress(intent.recipient);
    const amount = BigInt(intent.amountBaseUnits);
    if (amount <= 0n) throw new AppError("INVALID_AMOUNT", "Transfer amount must be greater than zero.");
    const [account, gas, ledger, balance] = await Promise.all([
      this.aptosRequest<{ sequence_number: string }>(`/accounts/${sender}`),
      this.aptosRequest<{ gas_estimate: number | string }>("/estimate_gas_price"),
      this.aptosRequest<{ ledger_timestamp: string }>("/"),
      this.base.getBalance(userId, "POL", "APTOS")
    ]);
    const gasUnitPrice = BigInt(gas.gas_estimate);
    const maxFee = APTOS_MAX_GAS_AMOUNT * gasUnitPrice;
    if (BigInt(balance.raw) < amount + maxFee) {
      throw new AppError("INSUFFICIENT_FUNDS", "Insufficient APT for the transfer amount and maximum gas fee.");
    }
    const ledgerSeconds = BigInt(ledger.ledger_timestamp) / 1_000_000n;
    const request: AptosUnsignedRequest = {
      sender,
      sequence_number: account.sequence_number,
      max_gas_amount: APTOS_MAX_GAS_AMOUNT.toString(),
      gas_unit_price: gasUnitPrice.toString(),
      expiration_timestamp_secs: (ledgerSeconds + 600n).toString(),
      payload: {
        type: "entry_function_payload",
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: [recipient, amount.toString()]
      }
    };
    const signingMessageHex = await this.aptosRequest<string>("/transactions/encode_submission", {
      method: "POST",
      body: JSON.stringify(request)
    });
    if (!/^0x[0-9a-fA-F]+$/.test(signingMessageHex)) throw new AppError("RPC_UNAVAILABLE", "Aptos fullnode returned an invalid signing message.", 503);
    return { kind: "APTOS", request, signingMessageHex: signingMessageHex.toLowerCase(), maxFeeOctas: maxFee.toString() };
  }

  async broadcastRawTransaction(network: NetworkId, rawTransaction: string): Promise<ExecutionResult> {
    if (network === "CASPER") {
      let signed: { deployJson: Record<string, unknown>; signerPublicKeyHex: string; signatureHex: string };
      try {
        signed = JSON.parse(rawTransaction) as typeof signed;
      } catch {
        throw new AppError("SIGNING_FAILED", "Signed Casper deploy is malformed.");
      }
      const deploy = attachCasperApproval(signed.deployJson, signed.signerPublicKeyHex, signed.signatureHex);
      const hash = (deploy as { hash?: unknown }).hash;
      if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
        throw new AppError("SIGNING_FAILED", "Signed Casper deploy has no valid hash.");
      }
      const result = await this.rpc<{ deploy_hash: string }>("CASPER", "account_put_deploy", { deploy });
      // The node echoes the hash it accepted; if it differs from the one the
      // user approved, something other than their deploy was submitted.
      if (result.deploy_hash !== hash) {
        throw new AppError("SIGNING_FAILED", "The Casper node accepted a different deploy hash.");
      }
      return {
        status: "PENDING",
        transactionHash: hash,
        explorerUrl: `${specFor("CASPER").explorerBaseUrl}/deploy/${hash}`,
        receiptId: `casper:${hash}`,
        confirmations: 0
      };
    }
    if (network === "NEAR") {
      let signed: Buffer;
      try {
        signed = Buffer.from(rawTransaction, "base64");
        if (signed.length <= 65) throw new Error("Too short.");
      } catch {
        throw new AppError("SIGNING_FAILED", "Signed NEAR transaction is malformed.");
      }
      const expectedHash = nearHash(signed.subarray(0, signed.length - 65));
      const hash = await this.rpc<string>("NEAR", "broadcast_tx_async", [rawTransaction]);
      if (hash !== expectedHash) throw new AppError("SIGNING_FAILED", "NEAR RPC returned an unexpected transaction hash.");
      return {
        status: "PENDING",
        transactionHash: hash,
        explorerUrl: `https://nearblocks.io/txns/${hash}`,
        receiptId: `near:${hash}`,
        confirmations: 0
      };
    }
    if (network === "APTOS") {
      let signed: { request: AptosUnsignedRequest; publicKeyHex: string; signatureHex: string };
      try {
        signed = JSON.parse(rawTransaction) as typeof signed;
      } catch {
        throw new AppError("SIGNING_FAILED", "Signed Aptos transaction is malformed.");
      }
      const result = await this.aptosRequest<{ hash: string }>("/transactions", {
        method: "POST",
        body: JSON.stringify({
          ...signed.request,
          signature: {
            type: "ed25519_signature",
            public_key: signed.publicKeyHex,
            signature: signed.signatureHex
          }
        })
      });
      if (!/^0x[0-9a-fA-F]{64}$/.test(result.hash)) throw new AppError("RPC_UNAVAILABLE", "Aptos fullnode returned an invalid transaction hash.", 503);
      return {
        status: "PENDING",
        transactionHash: result.hash,
        explorerUrl: `https://explorer.aptoslabs.com/txn/${result.hash}?network=mainnet`,
        receiptId: `aptos:${result.hash}`,
        confirmations: 0
      };
    }
    if (!this.base.broadcastRawTransaction) throw new AppError("SIGNING_FAILED", "Broadcasting is unavailable.", 501);
    return this.base.broadcastRawTransaction(network, rawTransaction);
  }

  async getTransactionStatus(transactionHash: string, network: NetworkId = "POLYGON"): Promise<ExecutionResult | null> {
    if (network === "NEAR") return null;
    if (network === "APTOS") {
      try {
        const result = await this.aptosRequest<{ type: string; success?: boolean; vm_status?: string }>(`/transactions/by_hash/${transactionHash}`);
        if (result.type === "pending_transaction") return null;
        const success = result.success === true;
        return {
          status: success ? "CONFIRMED" : "FAILED",
          transactionHash,
          explorerUrl: `https://explorer.aptoslabs.com/txn/${transactionHash}?network=mainnet`,
          receiptId: `aptos:${transactionHash}`,
          confirmations: success ? 1 : 0
        };
      } catch {
        return null;
      }
    }
    return this.base.getTransactionStatus(transactionHash, network);
  }
}
