import { createHash } from "node:crypto";
import type { ExecutionResult, WalletAdapter } from "@aifinpay/aifinpay-adapter";
import {
  DEMO_AGENT_ID, DEMO_USER_ID, DEMO_WALLET_ADDRESS, DEMO_WALLET_ID, formatBaseUnits,
  type AgentPolicy, type Balance, type NetworkId, type PaymentIntent, type TransactionRecord, type WalletSummary
} from "@aifinpay/shared";

const RECIPIENT = "0x2222222222222222222222222222222222222222";

function tx(index: number, direction: "IN" | "OUT", amount: string, actor: "USER" | "AGENT", decision: "AUTO_APPROVED" | "HUMAN_APPROVAL_REQUIRED"): TransactionRecord {
  const raw = BigInt(amount.replace(".", "").padEnd(amount.includes(".") ? amount.indexOf(".") + 7 : amount.length + 6, "0").replace(".", "")).toString();
  const hash = `0x${createHash("sha256").update(`aifinpay-demo-${index}`).digest("hex")}`;
  return {
    id: `tx-demo-${index}`,
    timestamp: new Date(Date.UTC(2026, 6, 18, 8 - index, 15)).toISOString(),
    direction,
    token: "USDC",
    amount,
    amountBaseUnits: raw,
    network: "POLYGON_AMOY",
    status: "CONFIRMED",
    recipient: direction === "OUT" ? RECIPIENT : DEMO_WALLET_ADDRESS,
    initiatedByType: actor,
    initiatedById: actor === "AGENT" ? DEMO_AGENT_ID : DEMO_USER_ID,
    policyDecision: decision,
    transactionHash: hash,
    auditReceiptId: `receipt-demo-${index}`
  };
}

export const DEMO_POLICY: AgentPolicy = {
  policyId: "policy-research-agent-001",
  ownerUserId: DEMO_USER_ID,
  agentId: DEMO_AGENT_ID,
  name: "Research API budget",
  enabled: true,
  dailyLimit: "5",
  perTransactionLimit: "0.50",
  tokenAllowlist: ["USDC"],
  networkAllowlist: ["POLYGON_AMOY"],
  allowedRecipients: [RECIPIENT],
  allowedMerchantCategories: ["API_PROVIDER"],
  merchantAllowlist: ["demo-data-api"],
  approvalThreshold: "0.10",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
  createdAt: "2026-07-18T06:00:00.000Z",
  updatedAt: "2026-07-18T06:00:00.000Z"
};

export class DemoLedgerAdapter implements WalletAdapter {
  readonly kind = "DEMO" as const;
  private readonly balances = new Map<string, bigint>([["USDC", 2_543_680_000n], ["POL", 1_250_000_000_000_000_000n]]);
  private readonly transactions: TransactionRecord[] = [
    tx(1, "OUT", "0.10", "AGENT", "AUTO_APPROVED"),
    tx(2, "IN", "125", "USER", "HUMAN_APPROVAL_REQUIRED"),
    tx(3, "OUT", "10", "USER", "HUMAN_APPROVAL_REQUIRED"),
    tx(4, "OUT", "0.25", "AGENT", "HUMAN_APPROVAL_REQUIRED"),
    tx(5, "IN", "2500", "USER", "HUMAN_APPROVAL_REQUIRED")
  ];
  private readonly receipts = new Map<string, ExecutionResult>();

  async getWalletSummary(userId: string, network: NetworkId = "POLYGON_AMOY"): Promise<WalletSummary> {
    if (userId !== DEMO_USER_ID) throw new Error("Wallet not found");
    return {
      walletId: DEMO_WALLET_ID,
      address: DEMO_WALLET_ADDRESS,
      maskedAddress: `${DEMO_WALLET_ADDRESS.slice(0, 6)}…${DEMO_WALLET_ADDRESS.slice(-4)}`,
      selectedNetwork: network,
      balances: [await this.getBalance(userId, "USDC", network), await this.getBalance(userId, "POL", network)],
      latestTransactions: this.transactions.slice(0, 5),
      activeAgentPolicies: [DEMO_POLICY],
      mode: "DEMO"
    };
  }

  async getBalance(userId: string, token: "USDC" | "POL", _network: NetworkId): Promise<Balance> {
    void _network;
    if (userId !== DEMO_USER_ID) throw new Error("Wallet not found");
    const decimals = token === "USDC" ? 6 : 18;
    const raw = this.balances.get(token) ?? 0n;
    return { token, raw: raw.toString(), formatted: formatBaseUnits(raw, decimals, token === "USDC" ? 2 : 4), decimals };
  }

  async listTransactions(userId: string): Promise<TransactionRecord[]> {
    if (userId !== DEMO_USER_ID) throw new Error("Wallet not found");
    return [...this.transactions];
  }

  async execute(intent: PaymentIntent): Promise<ExecutionResult> {
    const prior = intent.transactionHash ? this.receipts.get(intent.transactionHash) : undefined;
    if (prior) return prior;
    const transactionHash = `0x${createHash("sha256").update(`execute:${intent.id}`).digest("hex")}`;
    const result: ExecutionResult = {
      status: "CONFIRMED",
      transactionHash,
      explorerUrl: `https://amoy.polygonscan.com/tx/${transactionHash}`,
      receiptId: intent.auditReceiptId,
      confirmations: 2
    };
    this.receipts.set(transactionHash, result);
    const amount = BigInt(intent.amountBaseUnits);
    this.balances.set(intent.token, (this.balances.get(intent.token) ?? 0n) - amount);
    this.transactions.unshift({
      id: `tx-${intent.id}`, timestamp: new Date().toISOString(), direction: "OUT", token: intent.token,
      amount: intent.amount, amountBaseUnits: intent.amountBaseUnits, network: intent.network, status: "CONFIRMED",
      recipient: intent.recipient, initiatedByType: intent.initiatedByType, initiatedById: intent.initiatedById,
      policyDecision: intent.policyDecision, transactionHash, auditReceiptId: intent.auditReceiptId
    });
    return result;
  }

  async getTransactionStatus(transactionHash: string): Promise<ExecutionResult | null> {
    return this.receipts.get(transactionHash) ?? null;
  }
}
