import type { Balance, NetworkId, PaymentIntent, TransactionRecord, UnsignedWalletTransaction, WalletSummary } from "@aifinpay/shared";

export interface ExecutionResult {
  status: "PENDING" | "CONFIRMED" | "FAILED";
  transactionHash: string;
  explorerUrl: string;
  receiptId: string;
  confirmations: number;
}

export interface WalletAdapter {
  readonly kind: "DEMO" | "TESTNET" | "MAINNET";
  getWalletSummary(userId: string, network?: NetworkId): Promise<WalletSummary>;
  getBalance(userId: string, token: "USDC" | "POL", network: NetworkId): Promise<Balance>;
  listTransactions(userId: string): Promise<TransactionRecord[]>;
  execute(intent: PaymentIntent): Promise<ExecutionResult>;
  getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null>;
  // Non-custodial signing pair, implemented only by the mainnet adapter. The
  // server builds exact chain-specific bytes for the on-device Vault to sign,
  // then validates and broadcasts the signed payload it returns.
  buildTransferTransaction?(userId: string, intent: PaymentIntent): Promise<UnsignedWalletTransaction>;
  broadcastRawTransaction?(network: NetworkId, rawTransaction: string): Promise<ExecutionResult>;
}
