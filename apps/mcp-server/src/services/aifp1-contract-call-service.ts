import { createHash } from "node:crypto";
import { decodeFunctionData } from "viem";
import {
  AppError, LIVE_NETWORKS, formatBaseUnits,
  type LiveNetworkSpec, type NetworkId, type PaymentIntent
} from "@aifinpay/shared";
import type { AnalyticsService } from "../analytics/analytics-service.js";
import type { AuditService } from "../audit/audit-service.js";
import type { TrustedAifp1Route } from "../config.js";
import type { Store } from "../storage/store.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_QUOTE_TTL_SECONDS = 15 * 60;

const AIFP1_V13_ABI = [{
  type: "function",
  name: "payNative",
  stateMutability: "payable",
  inputs: [{
    name: "_payment",
    type: "tuple",
    components: [
      { name: "paymentId", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "ipCreator", type: "address" },
      { name: "validUntil", type: "uint256" },
      { name: "orderId", type: "string" }
    ]
  }],
  outputs: []
}] as const;

export interface PrepareAifp1ContractCallInput {
  network: NetworkId;
  chainId: number;
  to: string;
  value: string;
  data: string;
  grossUsd: string;
  initiatedByAgentId?: string;
  idempotencyKey: string;
}

export interface PreparedAifp1ContractCall {
  intent: PaymentIntent;
  decoded: {
    function: "payNative";
    paymentId: string;
    merchant: string;
    grossAmountBaseUnits: string;
    ipCreator: string;
    validUntil: number;
    orderId: string;
    contract: string;
    routeClass: "merchant-aifp1";
    splitterVersion: "1.3";
    economicsProfile: "AIFP-1:100/0:gross";
  };
}

export class Aifp1ContractCallService {
  constructor(
    private readonly store: Store,
    private readonly audit: AuditService,
    private readonly trustedRoutes: TrustedAifp1Route[],
    private readonly maxGrossUsd: number,
    private readonly analytics?: AnalyticsService
  ) {}

  private digest(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  prepare(userId: string, input: PrepareAifp1ContractCallInput): PreparedAifp1ContractCall {
    const requestHash = this.digest(input);
    const existing = this.store.getIntentByIdempotency(userId, input.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash || !existing.intent.contractCall) {
        throw new AppError("DUPLICATE_REQUEST", "This idempotency key was already used for a different request.");
      }
      return { intent: existing.intent, decoded: this.publicDecoded(existing.intent) };
    }

    const spec = (LIVE_NETWORKS as Record<string, LiveNetworkSpec>)[input.network];
    if (!spec || spec.family !== "EVM" || !spec.chainId || spec.chainId !== input.chainId) {
      throw new AppError("NETWORK_UNSUPPORTED", "AIFP-1 contract settlement requires an exact supported EVM network and chainId.");
    }

    const contract = input.to.toLowerCase();
    const route = this.trustedRoutes.find((candidate) =>
      candidate.network === input.network
      && candidate.chainId === input.chainId
      && candidate.contract === contract
    );
    if (!route) {
      throw new AppError("SIGNING_FAILED", "This AIFP-1 settlement route is not independently trusted by the wallet. Signing is blocked.", 403);
    }

    if (!/^0x[0-9a-fA-F]+$/.test(input.data) || input.data.length < 10) {
      throw new AppError("SIGNING_FAILED", "AIFP-1 settlement calldata is missing or malformed.");
    }
    const data = input.data.toLowerCase();
    if (data.slice(0, 10) !== route.selector) {
      throw new AppError("SIGNING_FAILED", "The settlement selector does not match the trusted AIFP-1 route.", 403);
    }

    let tuple: {
      paymentId: `0x${string}`;
      merchant: `0x${string}`;
      grossAmount: bigint;
      ipCreator: `0x${string}`;
      validUntil: bigint;
      orderId: string;
    };
    try {
      const decoded = decodeFunctionData({ abi: AIFP1_V13_ABI, data: data as `0x${string}` });
      if (decoded.functionName !== "payNative" || !decoded.args?.[0]) throw new Error("wrong function");
      tuple = decoded.args[0] as typeof tuple;
    } catch {
      throw new AppError("SIGNING_FAILED", "The wallet could not decode the AIFP-1 v1.3 payNative call.", 403);
    }

    const value = this.atomicValue(input.value);
    if (value <= 0n || value !== tuple.grossAmount) {
      throw new AppError("INVALID_AMOUNT", "The transaction value must exactly equal the decoded AIFP-1 grossAmount.");
    }
    if (tuple.ipCreator.toLowerCase() !== ZERO_ADDRESS) {
      throw new AppError("SIGNING_FAILED", "AIFP-1 v1.3 requires creator=0 for the 100/0 profile.", 403);
    }
    if (tuple.paymentId === `0x${"0".repeat(64)}`) {
      throw new AppError("SIGNING_FAILED", "AIFP-1 payment_id cannot be zero.", 403);
    }
    if (!tuple.orderId || tuple.orderId.length > 128) {
      throw new AppError("SIGNING_FAILED", "AIFP-1 orderId is missing or too long.", 403);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const validUntil = Number(tuple.validUntil);
    if (!Number.isSafeInteger(validUntil) || validUntil <= nowSeconds) {
      throw new AppError("QUOTE_EXPIRED", "The AIFP-1 settlement quote has expired.", 410);
    }
    if (validUntil - nowSeconds > MAX_QUOTE_TTL_SECONDS) {
      throw new AppError("SIGNING_FAILED", "The AIFP-1 settlement expiry is outside the wallet safety window.", 403);
    }

    const grossUsd = Number(input.grossUsd);
    if (!Number.isFinite(grossUsd) || grossUsd <= 0 || grossUsd > this.maxGrossUsd) {
      throw new AppError("POLICY_BLOCKED", `AIFP-1 gross cost exceeds the wallet settlement budget of $${this.maxGrossUsd.toFixed(2)}.`, 403);
    }

    const amountBaseUnits = value.toString();
    const amount = formatBaseUnits(amountBaseUnits, spec.native.decimals, 8);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(validUntil * 1000).toISOString();
    const id = `pi_aifp1_${this.digest(`${userId}:${input.idempotencyKey}`).slice(0, 16)}`;
    const auditReceiptId = `receipt_${this.digest(`receipt:${id}`).slice(0, 20)}`;
    const intent: PaymentIntent = {
      id,
      ownerUserId: userId,
      walletId: `wallet_${this.digest(userId).slice(0, 20)}`,
      initiatedByType: input.initiatedByAgentId ? "AGENT" : "USER",
      initiatedById: input.initiatedByAgentId ?? userId,
      recipient: route.contract,
      merchantId: tuple.merchant.toLowerCase(),
      purpose: `AIFP-1 settlement ${tuple.orderId}`,
      token: "POL",
      tokenAddress: null,
      amount,
      amountBaseUnits,
      network: input.network,
      chainId: input.chainId,
      estimatedFee: `Calculated at signing in ${spec.native.symbol}`,
      status: "AUTO_APPROVED",
      policyDecision: "AUTO_APPROVED",
      policyReasonCodes: ["ALLOWED_WITHIN_POLICY"],
      riskLevel: "LOW",
      createdAt,
      expiresAt,
      idempotencyKey: input.idempotencyKey,
      auditReceiptId,
      contractCall: {
        kind: "AIFP1_V13_NATIVE",
        routeClass: route.routeClass,
        splitterVersion: route.splitterVersion,
        economicsProfile: route.economicsProfile,
        contract: route.contract,
        runtimeCodeHash: route.runtimeCodeHash,
        selector: route.selector,
        data,
        valueBaseUnits: amountBaseUnits,
        paymentId: tuple.paymentId.toLowerCase(),
        merchant: tuple.merchant.toLowerCase(),
        ipCreator: tuple.ipCreator.toLowerCase(),
        validUntil,
        orderId: tuple.orderId,
        grossUsd: input.grossUsd
      }
    };

    this.store.saveIntent(intent, requestHash);
    this.audit.record({
      userId,
      agentId: input.initiatedByAgentId ?? null,
      action: "PREPARE_CONTRACT_CALL",
      entityType: "PaymentIntent",
      entityId: id,
      decision: "AUTO_APPROVED",
      reasonCode: "AIFP1_TRUSTED_ROUTE",
      metadata: {
        network: input.network,
        chainId: input.chainId,
        contract: route.contract,
        selector: route.selector,
        paymentId: tuple.paymentId,
        merchant: tuple.merchant,
        grossAmountBaseUnits: amountBaseUnits,
        validUntil,
        runtimeCodeHash: route.runtimeCodeHash
      }
    });
    this.analytics?.record("transfer_prepared", "server", {
      userId,
      intentId: id,
      network: input.network,
      asset: spec.native.symbol,
      amount,
      stage: "AIFP1_CONTRACT_CALL"
    });
    return { intent, decoded: this.publicDecoded(intent) };
  }

  private atomicValue(value: string): bigint {
    try {
      if (!/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(value)) throw new Error("bad value");
      return BigInt(value);
    } catch {
      throw new AppError("INVALID_AMOUNT", "Contract call value must be an exact atomic integer or 0x quantity.");
    }
  }

  private publicDecoded(intent: PaymentIntent): PreparedAifp1ContractCall["decoded"] {
    const call = intent.contractCall;
    if (!call) throw new AppError("INTERNAL_ERROR", "Stored AIFP-1 contract call is missing.", 500);
    return {
      function: "payNative",
      paymentId: call.paymentId,
      merchant: call.merchant,
      grossAmountBaseUnits: call.valueBaseUnits,
      ipCreator: call.ipCreator,
      validUntil: call.validUntil,
      orderId: call.orderId,
      contract: call.contract,
      routeClass: call.routeClass,
      splitterVersion: call.splitterVersion,
      economicsProfile: call.economicsProfile
    };
  }
}
