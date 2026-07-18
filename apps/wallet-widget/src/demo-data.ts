import type { WidgetData } from "./types.js";

export const browserDemoData: WidgetData = {
  view: "wallet",
  summary: {
    walletId: "wallet-demo-001", address: "", maskedAddress: "0xA1F1…D3F0", selectedNetwork: "POLYGON_AMOY", mode: "DEMO",
    balances: [
      { token: "USDC", raw: "2543680000", formatted: "2543.68", decimals: 6 },
      { token: "POL", raw: "1250000000000000000", formatted: "1.25", decimals: 18 }
    ],
    latestTransactions: [
      { id: "tx-1", timestamp: "2026-07-18T07:15:00.000Z", direction: "OUT", token: "USDC", amount: "0.10", amountBaseUnits: "100000", network: "POLYGON_AMOY", status: "CONFIRMED", recipient: "0x2222222222222222222222222222222222222222", initiatedByType: "AGENT", initiatedById: "research-agent", policyDecision: "AUTO_APPROVED", transactionHash: "0xabc", auditReceiptId: "receipt-demo-1" },
      { id: "tx-2", timestamp: "2026-07-18T06:15:00.000Z", direction: "IN", token: "USDC", amount: "125", amountBaseUnits: "125000000", network: "POLYGON_AMOY", status: "CONFIRMED", recipient: "0xA1F1A1000000000000000000000000000000D3F0", initiatedByType: "USER", initiatedById: "demo-user-001", policyDecision: "HUMAN_APPROVAL_REQUIRED", transactionHash: "0xdef", auditReceiptId: "receipt-demo-2" }
    ],
    activeAgentPolicies: []
  }
};

