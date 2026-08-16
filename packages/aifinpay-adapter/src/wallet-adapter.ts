import type {
  Balance, NetworkId, PaymentIntent, SettlementInvoice, TransactionRecord,
  UnsignedWalletTransaction, WalletSummary
} from "@aifinpay/shared";

export interface ExecutionResult {
  status: "PENDING" | "CONFIRMED" | "FAILED";
  transactionHash: string;
  explorerUrl: string;
  receiptId: string;
  confirmations: number;
}

export interface SettlementBuildResult {
  transaction: UnsignedWalletTransaction;
  /** ERC-20 allowance can require one explicit approval transaction before the
   * settlement call. Every signing request remains a single unambiguous tx. */
  stage: "APPROVAL" | "SETTLEMENT";
}

export interface WalletAdapter {
  readonly kind: "DEMO" | "TESTNET" | "MAINNET";
  getWalletSummary(userId: string, network?: NetworkId): Promise<WalletSummary>;
  getBalance(userId: string, token: "USDC" | "POL", network: NetworkId): Promise<Balance>;
  listTransactions(userId: string): Promise<TransactionRecord[]>;
  execute(intent: PaymentIntent): Promise<ExecutionResult>;
  getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null>;
  buildTransferTransaction?(userId: string, intent: PaymentIntent): Promise<UnsignedWalletTransaction>;
  /** Build bytes for the exact canonical settlement invoice returned by the
   * AiFinPay control plane. Implementations must fail closed on any mismatch. */
  buildSettlementTransaction?(userId: string, invoice: SettlementInvoice): Promise<SettlementBuildResult>;
  broadcastRawTransaction?(network: NetworkId, rawTransaction: string): Promise<ExecutionResult>;
}
