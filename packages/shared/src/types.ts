export type NetworkId =
  | "POLYGON" | "POLYGON_AMOY"
  | "AVALANCHE" | "ARBITRUM" | "BNB" | "BASE" | "UNICHAIN" | "OPTIMISM" | "BOTCHAIN" | "XRPLEVM"
  | "SOLANA" | "NEAR" | "APTOS" | "CASPER";
// Slot selector passed to adapters: "POL" = the network's native-token slot, "USDC" = the stablecoin slot.
export type TokenSymbol = "USDC" | "POL";
export type ActorType = "USER" | "AGENT";
export type PolicyDecision = "AUTO_APPROVED" | "HUMAN_APPROVAL_REQUIRED" | "BLOCKED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type PolicyReasonCode =
  | "ALLOWED_WITHIN_POLICY" | "APPROVAL_THRESHOLD_EXCEEDED" | "DAILY_LIMIT_EXCEEDED"
  | "PER_TRANSACTION_LIMIT_EXCEEDED" | "TOKEN_NOT_ALLOWED" | "NETWORK_NOT_ALLOWED"
  | "RECIPIENT_NOT_ALLOWED" | "MERCHANT_NOT_ALLOWED" | "POLICY_EXPIRED" | "POLICY_DISABLED"
  | "INSUFFICIENT_BALANCE" | "DUPLICATE_REQUEST" | "INVALID_ADDRESS" | "HIGH_RISK_REQUEST"
  | "USER_CONFIRMATION_REQUIRED";

export type PaymentIntentStatus = "DRAFT" | "REQUIRES_CONFIRMATION" | "AUTO_APPROVED" | "BLOCKED" |
  "CONFIRMED" | "SIGNING" | "SUBMITTED" | "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXPIRED";

export interface Balance { token: string; raw: string; formatted: string; decimals: number }

export interface TransactionRecord {
  id: string;
  timestamp: string;
  direction: "IN" | "OUT";
  token: TokenSymbol;
  amount: string;
  amountBaseUnits: string;
  network: NetworkId;
  status: "PENDING" | "CONFIRMED" | "FAILED" | "CANCELLED";
  recipient: string;
  initiatedByType: ActorType;
  initiatedById: string;
  policyDecision: PolicyDecision;
  transactionHash: string;
  auditReceiptId: string;
}

export interface AgentPolicy {
  policyId: string;
  ownerUserId: string;
  agentId: string;
  name: string;
  enabled: boolean;
  dailyLimit: string;
  perTransactionLimit: string;
  tokenAllowlist: TokenSymbol[];
  networkAllowlist: NetworkId[];
  allowedRecipients: string[];
  allowedMerchantCategories: string[];
  merchantAllowlist: string[];
  approvalThreshold: string;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  id: string;
  ownerUserId: string;
  walletId: string;
  initiatedByType: ActorType;
  initiatedById: string;
  recipient: string;
  merchantId?: string;
  merchantCategory?: string;
  purpose?: string;
  token: TokenSymbol;
  tokenAddress: string | null;
  amount: string;
  amountBaseUnits: string;
  network: NetworkId;
  chainId: number;
  estimatedFee: string;
  status: PaymentIntentStatus;
  policyDecision: PolicyDecision;
  policyReasonCodes: PolicyReasonCode[];
  riskLevel: RiskLevel;
  createdAt: string;
  expiresAt: string;
  confirmedAt?: string;
  submittedAt?: string;
  transactionHash?: string;
  idempotencyKey: string;
  auditReceiptId: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  userId: string;
  agentId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  decision: string;
  reasonCode: string;
  metadataHash: string;
  previousHash: string;
  currentHash: string;
}

export interface WalletSummary {
  walletId: string;
  maskedAddress: string;
  address: string;
  selectedNetwork: NetworkId;
  balances: Balance[];
  latestTransactions: TransactionRecord[];
  activeAgentPolicies: AgentPolicy[];
  mode: "DEMO" | "TESTNET" | "MAINNET";
  balanceError?: { code: string; message: string };
}

export interface SwapAsset {
  ticker: string;
  name: string;
  network: string;
  image?: string;
}

export interface SwapQuote {
  provider: "CHANGENOW";
  fromAsset: SwapAsset;
  toAsset: SwapAsset;
  fromAmount: string;
  estimatedAmount: string;
  minimumAmount?: string;
  validUntil: string;
}

export interface SwapOrder {
  provider: "CHANGENOW";
  id: string;
  status: string;
  fromAsset: SwapAsset;
  toAsset: SwapAsset;
  fromAmount: string;
  expectedAmount: string;
  payinAddress: string;
  payoutAddress: string;
  createdAt: string;
}

export interface UnsignedEvmTransaction {
  kind?: "EVM";
  to: string;
  value: string;
  data: string;
  nonce: number;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  chainId: number;
}

export interface UnsignedSolanaTransaction {
  kind: "SOLANA";
  messageBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  feeLamports: string;
}

export interface UnsignedNearTransaction {
  kind: "NEAR";
  transactionBase64: string;
  transactionHash: string;
  nonce: string;
  blockHash: string;
  feeReserveYocto: string;
}

export interface AptosEntryFunctionPayload {
  type: "entry_function_payload";
  function: "0x1::aptos_account::transfer";
  type_arguments: [];
  arguments: [string, string];
}

export interface AptosUnsignedRequest {
  sender: string;
  sequence_number: string;
  max_gas_amount: string;
  gas_unit_price: string;
  expiration_timestamp_secs: string;
  payload: AptosEntryFunctionPayload;
}

export interface UnsignedAptosTransaction {
  kind: "APTOS";
  request: AptosUnsignedRequest;
  signingMessageHex: string;
  maxFeeOctas: string;
}

export interface UnsignedCasperTransaction {
  kind: "CASPER";
  /** The deploy envelope, complete except for approvals. */
  deployJson: Record<string, unknown>;
  /** blake2b256 of the serialised header — this is what the vault signs. */
  deployHashHex: string;
  senderPublicKeyHex: string;
  paymentMotes: string;
}

export type UnsignedWalletTransaction =
  | UnsignedEvmTransaction
  | UnsignedSolanaTransaction
  | UnsignedNearTransaction
  | UnsignedAptosTransaction
  | UnsignedCasperTransaction;

export interface VaultSignRequest {
  intentId: string;
  submissionToken: string;
  transaction: UnsignedWalletTransaction;
  display: {
    recipient: string;
    amount: string;
    token: string;
    network: NetworkId;
    networkLabel: string;
  };
  expiresAt: string;
}
