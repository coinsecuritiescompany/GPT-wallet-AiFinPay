import type { Balance, NetworkId, PaymentIntent, TransactionRecord, WalletSummary } from "@aifinpay/shared";

export interface ExecutionResult {
  status: "PENDING" | "CONFIRMED" | "FAILED";
  transactionHash: string;
  explorerUrl: string;
  receiptId: string;
  confirmations: number;
}

export interface WalletAdapter {
  readonly kind: "DEMO" | "TESTNET";
  getWalletSummary(userId: string, network?: NetworkId): Promise<WalletSummary>;
  getBalance(userId: string, token: "USDC" | "POL", network: NetworkId): Promise<Balance>;
  listTransactions(userId: string): Promise<TransactionRecord[]>;
  execute(intent: PaymentIntent): Promise<ExecutionResult>;
  getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null>;
}

