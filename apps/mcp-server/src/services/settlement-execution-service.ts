import { createHash, randomUUID } from "node:crypto";
import type { ExecutionResult, SettlementBuildResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  AppError, LIVE_NETWORKS, buildCasperSettlementDeploy, buildNearFunctionCallTransaction,
  buildSolanaLegacyMessage, decodeBase58, encodeBase58, findSolanaProgramAddress,
  nearRpcPublicKey, solanaAssociatedTokenAddress, SOLANA_SYSTEM_PROGRAM, SOLANA_TOKEN_PROGRAM,
  type AptosUnsignedRequest, type LiveNetworkSpec, type NetworkId, type SettlementInvoice,
  type SettlementRouteClass, type SettlementSession, type UnsignedAptosTransaction,
  type UnsignedCasperTransaction, type UnsignedEvmTransaction, type UnsignedNearTransaction,
  type UnsignedSolanaTransaction
} from "@aifinpay/shared";
import { encodeFunctionData, keccak256 } from "viem";
import type { AppConfig, SettlementTrustedPin } from "../config.js";
import type { Store, StoredWalletAddresses } from "../storage/store.js";

const RPC_TIMEOUT_MS = 6_000;
const NEAR_CALL_GAS = 50_000_000_000_000n;
const NEAR_FEE_RESERVE = 10_000_000_000_000_000_000_000n;
const SOLANA_CONFIG_SEED = new TextEncoder().encode("aifinpay-settlement-config-v1");
const SOLANA_RECEIPT_SEED = new TextEncoder().encode("aifinpay-settlement-receipt-v1");
const SOLANA_CONFIG_MAGIC = Buffer.from("AIFPCFG1", "ascii");
const ZERO_EVM = "0x0000000000000000000000000000000000000000";

const CHAIN_TO_NETWORK: Record<string, NetworkId> = {
  polygon: "POLYGON", avalanche: "AVALANCHE", arbitrum: "ARBITRUM", bnb: "BNB",
  base: "BASE", unichain: "UNICHAIN", optimism: "OPTIMISM", botchain: "BOTCHAIN",
  xrplevm: "XRPLEVM", solana: "SOLANA", near: "NEAR", aptos: "APTOS", casper: "CASPER"
};

const SETTLEMENT_ABI = [
  {
    type: "function", name: "payNative", stateMutability: "payable",
    inputs: [
      { name: "paymentId", type: "bytes32" }, { name: "merchant", type: "address" },
      { name: "grossAmount", type: "uint256" }, { name: "ipCreator", type: "address" },
      { name: "validUntil", type: "uint256" }, { name: "orderId", type: "string" }
    ], outputs: []
  },
  {
    type: "function", name: "payStable", stateMutability: "nonpayable",
    inputs: [
      { name: "paymentId", type: "bytes32" }, { name: "token", type: "address" },
      { name: "grossAmount", type: "uint256" }, { name: "merchant", type: "address" },
      { name: "ipCreator", type: "address" }, { name: "validUntil", type: "uint256" },
      { name: "orderId", type: "string" }
    ], outputs: []
  }
] as const;
const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }
] as const;

interface PrepareInput {
  routeClass: SettlementRouteClass;
  chain: string;
  merchantWallet: string;
  grossAmount: string;
  asset?: string;
  orderId: string;
}
interface RpcEnvelope<T> { result?: T; error?: { code?: number; message?: string } }

function specFor(network: NetworkId): LiveNetworkSpec {
  const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[network];
  if (!spec) throw new AppError("NETWORK_UNSUPPORTED", `${network} is not a supported mainnet.`);
  return spec;
}
function strip0x(value: string): string { return value.startsWith("0x") ? value.slice(2) : value; }
function normalizeEvm(value: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === ZERO_EVM) throw new AppError("INVALID_ADDRESS", "Invalid EVM settlement address.");
  return value.toLowerCase();
}
function normalizeAptos(value: string): string {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new AppError("INVALID_ADDRESS", "Invalid Aptos address.");
  return `0x${value.slice(2).toLowerCase().padStart(64, "0")}`;
}
function toHexQuantity(value: bigint): `0x${string}` { return `0x${value.toString(16)}`; }
function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) throw new AppError("INVALID_AMOUNT", "Value does not fit in u64.");
  const out = new Uint8Array(8); new DataView(out.buffer).setBigUint64(0, value, true); return out;
}
function i64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0x7fffffffffffffffn) throw new AppError("INVALID_AMOUNT", "Value does not fit in i64.");
  const out = new Uint8Array(8); new DataView(out.buffer).setBigInt64(0, value, true); return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
function routeNumber(route: SettlementRouteClass): 1 | 2 { return route === "AIFP-1" ? 1 : 2; }
function evidenceHash(invoice: SettlementInvoice): string {
  return strip0x(invoice.runtime_code_hash ?? invoice.artifact_hash ?? "").toLowerCase();
}
function targetOf(raw: Record<string, unknown>): string {
  return String(raw.settlement_target ?? raw.splitter ?? "").trim();
}
function familyFor(network: NetworkId): SettlementInvoice["family"] {
  const f = specFor(network).family;
  if (f === "EVM" || f === "SOLANA" || f === "NEAR" || f === "APTOS" || f === "CASPER") return f;
  throw new AppError("NETWORK_UNSUPPORTED", "Unsupported settlement family.");
}

export class SettlementExecutionService {
  private rpcId = 0;

  constructor(
    private readonly store: Store,
    private readonly config: AppConfig,
    private readonly adapter: WalletAdapter
  ) {
    this.store.db.exec(`CREATE TABLE IF NOT EXISTS settlement_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, json TEXT NOT NULL
    )`);
  }

  private rpcUrls(network: NetworkId): string[] {
    const override = this.config.mainnetRpcUrls[network];
    return override?.length ? override : [...specFor(network).rpcUrls];
  }
  private headers(network: NetworkId): Record<string, string> {
    const auth = this.config.mainnetRpcAuth[network];
    return { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) };
  }
  private async rpc<T>(network: NetworkId, method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.rpcUrls(network)) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(url, { method: "POST", headers: this.headers(network), body: JSON.stringify({ jsonrpc: "2.0", id: ++this.rpcId, method, params }), signal: controller.signal });
        if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
        const body = await response.json() as RpcEnvelope<T>;
        if (body.error || body.result === undefined) throw new Error(body.error?.message ?? "Malformed RPC response");
        return body.result;
      } catch (error) { lastError = error; }
      finally { clearTimeout(timeout); }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", `${specFor(network).label} RPC is unavailable.`, 503);
  }
  private async aptos<T>(path: string, init?: RequestInit): Promise<T> {
    let lastError: unknown;
    for (const base of this.rpcUrls("APTOS")) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers: { ...this.headers("APTOS"), ...(init?.headers ?? {}) }, signal: controller.signal });
        const body = await response.json().catch(() => null) as T | { message?: string } | null;
        if (!response.ok) throw new Error((body as { message?: string } | null)?.message ?? `REST HTTP ${response.status}`);
        return body as T;
      } catch (error) { lastError = error; }
      finally { clearTimeout(timeout); }
    }
    void lastError;
    throw new AppError("RPC_UNAVAILABLE", "Aptos fullnode is unavailable.", 503);
  }

  private connection(userId: string): StoredWalletAddresses {
    const connection = this.store.getWalletConnection(userId);
    if (!connection) throw new AppError("WALLET_NOT_FOUND", "Connect AiFinPay Vault before preparing settlement.", 404);
    return connection.addresses;
  }

  private pin(input: PrepareInput, invoice: SettlementInvoice): SettlementTrustedPin {
    const pin = this.config.settlementPins?.[`${input.chain}:${input.routeClass}`];
    if (!pin) throw new AppError("SIGNING_FAILED", `Independent settlement pin is missing for ${input.chain}:${input.routeClass}.`, 503);
    const target = targetOf(invoice as unknown as Record<string, unknown>);
    const family = invoice.family;
    const targetMatches = family === "EVM" || family === "CASPER"
      ? target.toLowerCase().replace(/^(contract-|hash-)/, "") === pin.target.toLowerCase().replace(/^(contract-|hash-)/, "")
      : target === pin.target;
    if (!targetMatches) throw new AppError("SIGNING_FAILED", "Settlement target does not match the independent wallet pin.");
    if (evidenceHash(invoice) !== pin.evidenceHash.toLowerCase()) {
      throw new AppError("SIGNING_FAILED", "Settlement artifact/runtime hash does not match the independent wallet pin.");
    }
    if (invoice.source_commit && invoice.source_commit.toLowerCase() !== pin.sourceCommit.toLowerCase()) {
      throw new AppError("SIGNING_FAILED", "Settlement source commit does not match the independent wallet pin.");
    }
    return pin;
  }

  private normalizeInvoice(raw: unknown, input: PrepareInput, network: NetworkId): SettlementInvoice {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AppError("SIGNING_FAILED", "Settlement API returned an invalid invoice.");
    const value = raw as Record<string, any>;
    const target = targetOf(value);
    const gross = BigInt(String(value.breakdown?.gross_amount ?? "0"));
    const merchantAmount = BigInt(String(value.breakdown?.merchant_amount ?? "-1"));
    const treasury = BigInt(String(value.breakdown?.protocol_fee_amount ?? "-1"));
    const creator = BigInt(String(value.breakdown?.creator_amount ?? "-1"));
    const expectedTreasury = input.routeClass === "AIFP-1" ? gross / 100n : 0n;
    const expectedMerchant = gross - expectedTreasury;
    if (
      value.route_class !== input.routeClass || String(value.chain).toLowerCase() !== input.chain || !target
      || value.settlement_semantics !== "gross-inclusive" || value.fee_on_top !== false
      || String(value.order_id) !== input.orderId || String(value.breakdown?.gross_amount) !== input.grossAmount
      || Number(value.breakdown?.protocol_fee_bps) !== (input.routeClass === "AIFP-1" ? 100 : 0)
      || Number(value.breakdown?.creator_bps) !== 0 || creator !== 0n
      || treasury !== expectedTreasury || merchantAmount !== expectedMerchant
      || !Number.isInteger(Number(value.valid_until)) || Number(value.valid_until) * 1000 <= Date.now()
      || !value.transaction || typeof value.transaction !== "object"
    ) throw new AppError("SIGNING_FAILED", "Settlement invoice failed canonical validation.");
    if (input.asset && String(value.asset).toUpperCase() !== input.asset.toUpperCase()) throw new AppError("SIGNING_FAILED", "Settlement asset changed while preparing the invoice.");
    const merchant = String(value.merchant_wallet ?? "");
    if (merchant.toLowerCase() !== input.merchantWallet.toLowerCase()) throw new AppError("SIGNING_FAILED", "Settlement merchant changed while preparing the invoice.");
    return {
      ...value,
      family: familyFor(network),
      settlement_target: target,
      settlement_version: String(value.settlement_version ?? value.splitter_version ?? ""),
      merchant_wallet: merchant,
      route_class: input.routeClass,
      chain: input.chain,
      fee_on_top: false,
      settlement_semantics: "gross-inclusive"
    } as SettlementInvoice;
  }

  private async fetchInvoice(input: PrepareInput, network: NetworkId): Promise<SettlementInvoice> {
    const response = await fetch(`${this.config.settlementApiOrigin}/v1/settlement/invoice`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ route_class: input.routeClass, chain: input.chain, merchant_wallet: input.merchantWallet, gross_amount: input.grossAmount, ...(input.asset ? { asset: input.asset } : {}), order_id: input.orderId })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new AppError("SIGNING_FAILED", `Settlement route refused the invoice (HTTP ${response.status}).`, response.status >= 500 ? 503 : 400);
    return this.normalizeInvoice(body, input, network);
  }

  async prepare(userId: string, input: PrepareInput): Promise<SettlementSession> {
    const network = CHAIN_TO_NETWORK[input.chain];
    if (!network) throw new AppError("NETWORK_UNSUPPORTED", `Unsupported settlement chain: ${input.chain}`);
    if (this.config.walletMode !== "mainnet" || !this.config.signingNetworks.includes(network)) {
      throw new AppError("SIGNING_FAILED", `Settlement signing on ${network} is not enabled in this deployment.`, 403);
    }
    if (!/^[1-9]\d*$/.test(input.grossAmount)) throw new AppError("INVALID_AMOUNT", "grossAmount must be positive integer base units.");
    if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(input.orderId)) throw new AppError("DUPLICATE_REQUEST", "Invalid settlement order id.");
    this.connection(userId);
    const invoice = await this.fetchInvoice(input, network);
    const pin = this.pin(input, invoice);
    const built = await this.build(userId, network, invoice, pin);
    const now = new Date();
    const expiresAt = new Date(Math.min(Number(invoice.valid_until) * 1000, now.getTime() + 10 * 60_000)).toISOString();
    const session: SettlementSession = {
      id: `stl_${randomUUID().replace(/-/g, "")}`,
      ownerUserId: userId, network, invoice, transaction: built.transaction, stage: built.stage,
      status: "PREPARED", createdAt: now.toISOString(), expiresAt
    };
    this.save(session);
    return session;
  }

  private async build(userId: string, network: NetworkId, invoice: SettlementInvoice, pin: SettlementTrustedPin): Promise<SettlementBuildResult> {
    if (invoice.family === "EVM") return this.buildEvm(userId, network, invoice, pin);
    if (network === "SOLANA") return { stage: "SETTLEMENT", transaction: await this.buildSolana(userId, invoice) };
    if (network === "NEAR") return { stage: "SETTLEMENT", transaction: await this.buildNear(userId, invoice, pin) };
    if (network === "APTOS") return { stage: "SETTLEMENT", transaction: await this.buildAptos(userId, invoice) };
    if (network === "CASPER") return { stage: "SETTLEMENT", transaction: await this.buildCasper(userId, invoice) };
    throw new AppError("NETWORK_UNSUPPORTED", "Unsupported settlement family.");
  }

  private async evmUnsigned(network: NetworkId, from: string, to: string, data: string, value: bigint, fallbackGas: bigint): Promise<UnsignedEvmTransaction> {
    const [nonceHex, priorityHex, block, balanceHex] = await Promise.all([
      this.rpc<string>(network, "eth_getTransactionCount", [from, "pending"]),
      this.rpc<string>(network, "eth_maxPriorityFeePerGas", []).catch(() => "0x3b9aca00"),
      this.rpc<{ baseFeePerGas?: string }>(network, "eth_getBlockByNumber", ["latest", false]),
      this.rpc<string>(network, "eth_getBalance", [from, "pending"])
    ]);
    const priority = BigInt(priorityHex); const base = BigInt(block.baseFeePerGas ?? "0x0"); const maxFee = base * 2n + priority;
    const estimated = await this.rpc<string>(network, "eth_estimateGas", [{ from, to, value: toHexQuantity(value), data }]).then(BigInt).catch(() => fallbackGas);
    const gas = estimated + estimated / 5n;
    if (BigInt(balanceHex) < value + gas * maxFee) throw new AppError("INSUFFICIENT_FUNDS", `Insufficient ${specFor(network).native.symbol} for settlement and gas.`);
    return { kind: "EVM", to, value: toHexQuantity(value), data, nonce: Number(BigInt(nonceHex)), gas: toHexQuantity(gas), maxFeePerGas: toHexQuantity(maxFee), maxPriorityFeePerGas: toHexQuantity(priority), chainId: specFor(network).chainId ?? 0 };
  }

  private async buildEvm(userId: string, network: NetworkId, invoice: SettlementInvoice, pin: SettlementTrustedPin): Promise<SettlementBuildResult> {
    const from = normalizeEvm(this.connection(userId).evm);
    const target = normalizeEvm(invoice.settlement_target);
    const code = await this.rpc<`0x${string}`>(network, "eth_getCode", [target, "latest"]);
    if (!code || code === "0x") throw new AppError("SIGNING_FAILED", "Pinned settlement target has no runtime code.");
    if (strip0x(keccak256(code)).toLowerCase() !== pin.evidenceHash.toLowerCase()) throw new AppError("SIGNING_FAILED", "On-chain runtime code hash differs from the independent settlement pin.");
    const gross = BigInt(invoice.breakdown.gross_amount);
    const tx = invoice.transaction as Record<string, any>;
    if (tx.kind === "evm_contract_call") {
      const args = tx.args ?? {};
      if (args.paymentId !== invoice.payment_id || normalizeEvm(args.merchant) !== normalizeEvm(invoice.merchant_wallet) || BigInt(args.grossAmount) !== gross || normalizeEvm(args.ipCreator) !== ZERO_EVM || Number(args.validUntil) !== invoice.valid_until || String(args.orderId) !== invoice.order_id) throw new AppError("SIGNING_FAILED", "EVM native invoice calldata fields do not match the invoice.");
      const data = encodeFunctionData({ abi: SETTLEMENT_ABI, functionName: "payNative", args: [invoice.payment_id as `0x${string}`, invoice.merchant_wallet as `0x${string}`, gross, ZERO_EVM, BigInt(invoice.valid_until), invoice.order_id] });
      return { stage: "SETTLEMENT", transaction: await this.evmUnsigned(network, from, target, data, gross, 150_000n) };
    }
    if (tx.kind !== "evm_erc20_then_contract_call" || !invoice.token) throw new AppError("SIGNING_FAILED", "Unsupported EVM settlement transaction plan.");
    const token = normalizeEvm(invoice.token.address);
    const approve = tx.approve ?? {}; const settle = tx.settle ?? {};
    if (normalizeEvm(approve.token) !== token || normalizeEvm(approve.spender) !== target || BigInt(approve.amount) !== gross || settle.args?.paymentId !== invoice.payment_id || normalizeEvm(settle.args?.token) !== token || BigInt(settle.args?.grossAmount) !== gross || normalizeEvm(settle.args?.merchant) !== normalizeEvm(invoice.merchant_wallet) || normalizeEvm(settle.args?.ipCreator) !== ZERO_EVM || Number(settle.args?.validUntil) !== invoice.valid_until || String(settle.args?.orderId) !== invoice.order_id) throw new AppError("SIGNING_FAILED", "EVM stable invoice fields do not match the invoice.");
    const allowanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [from as `0x${string}`, target as `0x${string}`] });
    const balanceData = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [from as `0x${string}`] });
    const [allowanceHex, tokenBalanceHex] = await Promise.all([
      this.rpc<string>(network, "eth_call", [{ to: token, data: allowanceData }, "latest"]),
      this.rpc<string>(network, "eth_call", [{ to: token, data: balanceData }, "latest"])
    ]);
    if (BigInt(tokenBalanceHex) < gross) throw new AppError("INSUFFICIENT_FUNDS", `Insufficient ${invoice.asset} for settlement.`);
    if (BigInt(allowanceHex) < gross) {
      const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [target as `0x${string}`, gross] });
      return { stage: "APPROVAL", transaction: await this.evmUnsigned(network, from, token, data, 0n, 80_000n) };
    }
    const data = encodeFunctionData({ abi: SETTLEMENT_ABI, functionName: "payStable", args: [invoice.payment_id as `0x${string}`, token as `0x${string}`, gross, invoice.merchant_wallet as `0x${string}`, ZERO_EVM, BigInt(invoice.valid_until), invoice.order_id] });
    return { stage: "SETTLEMENT", transaction: await this.evmUnsigned(network, from, target, data, 0n, 200_000n) };
  }

  private async buildNear(userId: string, invoice: SettlementInvoice, pin: SettlementTrustedPin): Promise<UnsignedNearTransaction> {
    if (invoice.asset !== "NEAR") throw new AppError("TOKEN_UNSUPPORTED", "Reviewed NEAR settlement RC is native-only.");
    const sender = this.connection(userId).near;
    if (!/^[0-9a-f]{64}$/.test(sender)) throw new AppError("INVALID_ADDRESS", "Connected NEAR account must be the Vault implicit account.");
    const target = invoice.settlement_target;
    if (!/^[a-z0-9._-]{2,64}$/.test(target)) throw new AppError("INVALID_ADDRESS", "Invalid NEAR settlement contract.");
    // Independently hash the currently deployed Wasm before signing.
    const code = await this.rpc<{ code_base64: string }>("NEAR", "query", { request_type: "view_code", finality: "final", account_id: target });
    const codeHash = createHash("sha256").update(Buffer.from(code.code_base64, "base64")).digest("hex");
    if (codeHash !== pin.evidenceHash.toLowerCase()) throw new AppError("SIGNING_FAILED", "Deployed NEAR Wasm hash differs from the wallet pin.");
    const access = await this.rpc<{ nonce: number | string; block_hash: string }>("NEAR", "query", { request_type: "view_access_key", finality: "final", account_id: sender, public_key: nearRpcPublicKey(sender) });
    const gross = BigInt(invoice.breakdown.gross_amount);
    const balance = await this.adapter.getBalance(userId, "POL", "NEAR");
    if (BigInt(balance.raw) < gross + NEAR_FEE_RESERVE) throw new AppError("INSUFFICIENT_FUNDS", "Insufficient NEAR for gross settlement plus fee reserve.");
    const args = new TextEncoder().encode(JSON.stringify({ merchant: invoice.merchant_wallet, payment_id: invoice.payment_id, valid_until_ms: invoice.valid_until * 1000 }));
    const nonce = BigInt(access.nonce) + 1n;
    const transaction = buildNearFunctionCallTransaction(sender, sender, nonce, target, access.block_hash, "pay", args, NEAR_CALL_GAS, gross);
    return { kind: "NEAR", transactionBase64: Buffer.from(transaction).toString("base64"), transactionHash: encodeBase58(createHash("sha256").update(transaction).digest()), nonce: nonce.toString(), blockHash: access.block_hash, feeReserveYocto: NEAR_FEE_RESERVE.toString() };
  }

  private async buildAptos(userId: string, invoice: SettlementInvoice): Promise<UnsignedAptosTransaction> {
    if (invoice.asset !== "APT") throw new AppError("TOKEN_UNSUPPORTED", "Reviewed Aptos settlement RC is native-only.");
    const sender = normalizeAptos(this.connection(userId).aptos); const target = normalizeAptos(invoice.settlement_target); const merchant = normalizeAptos(invoice.merchant_wallet);
    const maxGasRaw = this.config.aptosSettlementMaxGas;
    if (!maxGasRaw) throw new AppError("SIGNING_FAILED", "APTOS_SETTLEMENT_MAX_GAS is not configured; refusing to guess a production gas cap.", 503);
    const maxGas = BigInt(maxGasRaw);
    const [account, gas, ledger, balance] = await Promise.all([
      this.aptos<{ sequence_number: string }>(`/accounts/${sender}`), this.aptos<{ gas_estimate: number | string }>("/estimate_gas_price"),
      this.aptos<{ ledger_timestamp: string }>("/"), this.adapter.getBalance(userId, "POL", "APTOS")
    ]);
    const gasPrice = BigInt(gas.gas_estimate); const maxFee = maxGas * gasPrice; const gross = BigInt(invoice.breakdown.gross_amount);
    if (BigInt(balance.raw) < gross + maxFee) throw new AppError("INSUFFICIENT_FUNDS", "Insufficient APT for settlement plus maximum gas.");
    const ledgerSeconds = BigInt(ledger.ledger_timestamp) / 1_000_000n;
    const txExpiry = BigInt(Math.min(invoice.valid_until, Number(ledgerSeconds + 600n)));
    if (txExpiry <= ledgerSeconds) throw new AppError("INTENT_EXPIRED", "Aptos settlement invoice expired.");
    const functionName = `${target}::settlement::pay`;
    const descriptor = invoice.transaction as Record<string, any>;
    if (String(descriptor.function).toLowerCase() !== functionName.toLowerCase()) throw new AppError("SIGNING_FAILED", "Aptos invoice function does not match the pinned settlement module.");
    const request: AptosUnsignedRequest = { sender, sequence_number: account.sequence_number, max_gas_amount: maxGas.toString(), gas_unit_price: gasPrice.toString(), expiration_timestamp_secs: txExpiry.toString(), payload: { type: "entry_function_payload", function: functionName, type_arguments: [], arguments: [merchant, gross.toString(), invoice.payment_id, String(invoice.valid_until)] } };
    const signingMessageHex = await this.aptos<string>("/transactions/encode_submission", { method: "POST", body: JSON.stringify(request) });
    if (!/^0x[0-9a-fA-F]+$/.test(signingMessageHex)) throw new AppError("RPC_UNAVAILABLE", "Aptos fullnode returned invalid signing bytes.", 503);
    return { kind: "APTOS", request, signingMessageHex: signingMessageHex.toLowerCase(), maxFeeOctas: maxFee.toString() };
  }

  private async buildCasper(userId: string, invoice: SettlementInvoice): Promise<UnsignedCasperTransaction> {
    if (invoice.asset !== "CSPR") throw new AppError("TOKEN_UNSUPPORTED", "Reviewed Casper settlement v3 is native-only.");
    const sender = this.connection(userId).casper;
    if (!/^01[0-9a-f]{64}$/i.test(sender)) throw new AppError("INVALID_ADDRESS", "Connected Casper key is invalid.");
    const paymentRaw = this.config.casperSettlementPaymentMotes;
    if (!paymentRaw) throw new AppError("SIGNING_FAILED", "CASPER_SETTLEMENT_PAYMENT_MOTES is not configured; refusing to guess production execution payment.", 503);
    const payment = BigInt(paymentRaw); const gross = BigInt(invoice.breakdown.gross_amount);
    const balance = await this.adapter.getBalance(userId, "POL", "CASPER");
    if (BigInt(balance.raw) < gross + payment) throw new AppError("INSUFFICIENT_FUNDS", "Insufficient CSPR for gross settlement plus execution payment.");
    const now = Date.now(); const validUntilMs = BigInt(invoice.valid_until) * 1000n; const remaining = Number(validUntilMs - BigInt(now));
    if (remaining <= 0) throw new AppError("INTENT_EXPIRED", "Casper settlement invoice expired.");
    const target = invoice.settlement_target.replace(/^(contract-|hash-)/, "");
    const deploy = buildCasperSettlementDeploy({ senderPublicKeyHex: sender, contractHash: target, route: routeNumber(invoice.route_class), merchantAccountHash: invoice.merchant_wallet, grossAmountMotes: gross, requestId: invoice.payment_id, validUntilMs, paymentMotes: payment, chainName: /testnet/i.test(this.rpcUrls("CASPER")[0] ?? "") ? "casper-test" : "casper", timestampMs: now, ttlMs: Math.min(remaining, 20 * 60_000) });
    return { kind: "CASPER", deployJson: deploy.deployJson, deployHashHex: deploy.deployHashHex, senderPublicKeyHex: sender.toLowerCase(), paymentMotes: payment.toString() };
  }

  private async buildSolana(userId: string, invoice: SettlementInvoice): Promise<UnsignedSolanaTransaction> {
    const payer = this.connection(userId).solana; const programId = invoice.settlement_target;
    if (decodeBase58(payer).length !== 32 || decodeBase58(programId).length !== 32 || decodeBase58(invoice.merchant_wallet).length !== 32) throw new AppError("INVALID_ADDRESS", "Invalid Solana settlement address.");
    const configPda = findSolanaProgramAddress([SOLANA_CONFIG_SEED], programId).address;
    const configResult = await this.rpc<{ value: { data: [string, string]; owner: string } | null }>("SOLANA", "getAccountInfo", [configPda, { encoding: "base64", commitment: "confirmed" }]);
    if (!configResult.value || configResult.value.owner !== programId) throw new AppError("SIGNING_FAILED", "Pinned Solana settlement config is missing or owned by another program.");
    const cfg = Buffer.from(configResult.value.data[0], "base64");
    if (cfg.length !== 138 || !cfg.subarray(0, 8).equals(SOLANA_CONFIG_MAGIC) || cfg[8] !== 1 || cfg[137] !== 0) throw new AppError("SIGNING_FAILED", "Solana settlement config is invalid or paused.");
    const treasury = encodeBase58(cfg.subarray(41, 73)); const usdcMint = encodeBase58(cfg.subarray(73, 105)); const usdtMint = encodeBase58(cfg.subarray(105, 137));
    const paymentId = Buffer.from(strip0x(invoice.payment_id), "hex");
    if (paymentId.length !== 32) throw new AppError("SIGNING_FAILED", "Solana payment id must be exactly 32 bytes.");
    const receiptPda = findSolanaProgramAddress([SOLANA_RECEIPT_SEED, paymentId], programId).address;
    const gross = BigInt(invoice.breakdown.gross_amount); const expiry = BigInt(invoice.valid_until);
    const data = concat(Uint8Array.of(invoice.asset === "SOL" ? 10 : 11, routeNumber(invoice.route_class)), paymentId, u64le(gross), i64le(expiry));
    const keys = invoice.asset === "SOL" ? [
      { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: invoice.merchant_wallet, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true }, { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: receiptPda, isSigner: false, isWritable: true }, { pubkey: SOLANA_SYSTEM_PROGRAM, isSigner: false, isWritable: false }
    ] : (() => {
      if (!invoice.token) throw new AppError("SIGNING_FAILED", "Solana token invoice has no canonical mint.");
      const mint = invoice.token.address; const expectedMint = invoice.asset === "USDC" ? usdcMint : invoice.asset === "USDT" ? usdtMint : "";
      if (!expectedMint || mint !== expectedMint) throw new AppError("SIGNING_FAILED", "Solana stable mint does not match on-chain settlement config.");
      const payerToken = solanaAssociatedTokenAddress(payer, mint); const merchantToken = solanaAssociatedTokenAddress(invoice.merchant_wallet, mint); const treasuryToken = solanaAssociatedTokenAddress(treasury, mint);
      return [
        { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: payerToken, isSigner: false, isWritable: true },
        { pubkey: merchantToken, isSigner: false, isWritable: true }, { pubkey: treasuryToken, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: receiptPda, isSigner: false, isWritable: true }, { pubkey: SOLANA_TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: SOLANA_SYSTEM_PROGRAM, isSigner: false, isWritable: false }
      ];
    })();
    const latest = await this.rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("SOLANA", "getLatestBlockhash", [{ commitment: "confirmed" }]);
    const message = buildSolanaLegacyMessage(payer, latest.value.blockhash, [{ programId, keys, data }]); const messageBase64 = Buffer.from(message).toString("base64");
    const [feeResult, solBalance] = await Promise.all([
      this.rpc<{ value: number | null }>("SOLANA", "getFeeForMessage", [messageBase64, { commitment: "confirmed" }]),
      this.rpc<{ value: number }>("SOLANA", "getBalance", [payer, { commitment: "confirmed" }])
    ]);
    const fee = BigInt(feeResult.value ?? 5_000); const requiredNative = fee + (invoice.asset === "SOL" ? gross : 0n);
    if (BigInt(solBalance.value) < requiredNative) throw new AppError("INSUFFICIENT_FUNDS", "Insufficient SOL for settlement and network fee.");
    if (invoice.asset !== "SOL") {
      const payerToken = keys[1]!.pubkey;
      const info = await this.rpc<{ value: unknown | null }>("SOLANA", "getAccountInfo", [payerToken, { encoding: "base64", commitment: "confirmed" }]);
      const merchantInfo = await this.rpc<{ value: unknown | null }>("SOLANA", "getAccountInfo", [keys[2]!.pubkey, { encoding: "base64", commitment: "confirmed" }]);
      const treasuryInfo = await this.rpc<{ value: unknown | null }>("SOLANA", "getAccountInfo", [keys[3]!.pubkey, { encoding: "base64", commitment: "confirmed" }]);
      if (!info.value || !merchantInfo.value || !treasuryInfo.value) throw new AppError("SIGNING_FAILED", "Required Solana associated token account is missing; refusing a transaction that would deterministically fail.", 409);
      const tokenBalance = await this.rpc<{ value: { amount: string } }>("SOLANA", "getTokenAccountBalance", [payerToken, { commitment: "confirmed" }]);
      if (BigInt(tokenBalance.value.amount) < gross) throw new AppError("INSUFFICIENT_FUNDS", `Insufficient ${invoice.asset} for settlement.`);
    }
    return { kind: "SOLANA", messageBase64, recentBlockhash: latest.value.blockhash, lastValidBlockHeight: latest.value.lastValidBlockHeight, feeLamports: fee.toString() };
  }

  private save(session: SettlementSession): void {
    this.store.db.prepare(`INSERT INTO settlement_sessions (id,user_id,status,json) VALUES (?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,json=excluded.json`).run(session.id, session.ownerUserId, session.status, JSON.stringify(session));
  }
  getSession(userId: string, id: string): SettlementSession | null {
    const row = this.store.db.prepare("SELECT json FROM settlement_sessions WHERE id=? AND user_id=?").get(id, userId) as { json: string } | undefined;
    if (!row) return null;
    const session = JSON.parse(row.json) as SettlementSession;
    if (session.status === "PREPARED" && new Date(session.expiresAt).getTime() <= Date.now()) { session.status = "EXPIRED"; this.save(session); }
    return session;
  }
  finalizeBroadcast(userId: string, id: string, execution: ExecutionResult): SettlementSession {
    const session = this.getSession(userId, id);
    if (!session) throw new AppError("WALLET_NOT_FOUND", "Settlement session not found.", 404);
    if (session.status !== "PREPARED" && session.status !== "SIGNED") throw new AppError("DUPLICATE_REQUEST", `Settlement session is already ${session.status}.`);
    session.status = execution.status === "FAILED" ? "FAILED" : execution.status === "CONFIRMED" ? "CONFIRMED" : "PENDING";
    session.transactionHash = execution.transactionHash; session.explorerUrl = execution.explorerUrl; this.save(session); return session;
  }

  async refresh(userId: string, id: string): Promise<SettlementSession> {
    const session = this.getSession(userId, id);
    if (!session) throw new AppError("WALLET_NOT_FOUND", "Settlement session not found.", 404);
    if (!session.transactionHash || !["PENDING", "SUBMITTED"].includes(session.status)) return session;
    if (session.network === "NEAR") {
      const args = Buffer.from(JSON.stringify({ payment_id: session.invoice.payment_id })).toString("base64");
      try {
        const result = await this.rpc<{ result: number[] }>("NEAR", "query", { request_type: "call_function", finality: "final", account_id: session.invoice.settlement_target, method_name: "get_payment_status", args_base64: args });
        const status = JSON.parse(Buffer.from(result.result).toString("utf8")) as string | null;
        if (status === "SETTLED") session.status = "CONFIRMED";
        else if (status === "FAILED") session.status = "FAILED";
      } catch { /* stay pending while final receipts are unavailable */ }
    } else if (session.network === "CASPER") {
      try {
        const deploy = await this.rpc<{ execution_results?: Array<{ result?: { Success?: unknown; Failure?: unknown } }> }>("CASPER", "info_get_deploy", { deploy_hash: session.transactionHash, finalized_approvals: true });
        const result = deploy.execution_results?.[0]?.result;
        if (result?.Success !== undefined) session.status = "CONFIRMED";
        else if (result?.Failure !== undefined) session.status = "FAILED";
      } catch { /* stay pending */ }
    } else {
      const status = await this.adapter.getTransactionStatus(session.transactionHash, session.network);
      if (status?.status === "CONFIRMED") session.status = "CONFIRMED";
      else if (status?.status === "FAILED") session.status = "FAILED";
    }
    this.save(session); return session;
  }
}
