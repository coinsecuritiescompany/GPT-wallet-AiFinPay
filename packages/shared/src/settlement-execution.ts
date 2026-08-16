import type { NetworkId, UnsignedWalletTransaction } from "./types.js";

export type SettlementRouteClass = "AIFP-1" | "AIFP-2";
export type SettlementSessionStatus = "PREPARED" | "SIGNED" | "SUBMITTED" | "PENDING" | "CONFIRMED" | "FAILED" | "EXPIRED";

export interface SettlementBreakdown {
  gross_amount: string;
  merchant_amount: string;
  protocol_fee_amount: string;
  creator_amount: string;
  protocol_fee_bps: number;
  creator_bps: number;
}

export interface SettlementInvoice {
  route_class: SettlementRouteClass;
  chain: string;
  family: "EVM" | "SOLANA" | "NEAR" | "APTOS" | "CASPER";
  settlement_target: string;
  settlement_version: string;
  settlement_semantics: "gross-inclusive";
  fee_on_top: false;
  asset: string;
  token?: { address: string; decimals: number; issuer: string } | null;
  payment_id: string;
  payment_id_encoding?: string;
  order_id: string;
  valid_until: number;
  merchant_wallet: string;
  breakdown: SettlementBreakdown;
  runtime_code_hash?: string;
  artifact_hash?: string;
  source_commit?: string;
  transaction: Record<string, unknown>;
}

export interface SettlementSession {
  id: string;
  ownerUserId: string;
  network: NetworkId;
  invoice: SettlementInvoice;
  /** Exactly one reviewed transaction is signed per session. For ERC-20 routes
   * this may be an approval step; after confirmation, a new settlement session
   * is prepared for the contract call. This keeps device approval unambiguous. */
  transaction: UnsignedWalletTransaction;
  stage: "APPROVAL" | "SETTLEMENT";
  status: SettlementSessionStatus;
  createdAt: string;
  expiresAt: string;
  transactionHash?: string;
  explorerUrl?: string;
}

export interface SettlementVaultSignRequest {
  settlementSessionId: string;
  submissionToken: string;
  transaction: UnsignedWalletTransaction;
  display: {
    routeClass: SettlementRouteClass;
    recipient: string;
    grossAmount: string;
    asset: string;
    network: NetworkId;
    stage: "APPROVAL" | "SETTLEMENT";
  };
  expiresAt: string;
}
