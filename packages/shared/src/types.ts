export type NetworkId = "POLYGON" | "POLYGON_AMOY";
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

export interface Balance { token: TokenSymbol; raw: string; formatted: string; decimals: number }

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
}
