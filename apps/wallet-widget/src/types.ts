import type { AgentPolicy, AuditEvent, MainnetNetwork, PaymentIntent, TransactionRecord, WalletSummary } from "@aifinpay/shared";

export type WalletView = "loading" | "wallet" | "balance" | "transfer-form" | "transfer-preview" | "blocked" |
  "agent-approval" | "policy-editor" | "policy-preview" | "policy" | "policies" | "history" | "audit" | "receipt" |
  "transaction-status" | "cancelled" | "error" | "not-connected" | "wallet-connect" | "wallet-connected" | "networks" |
  "receive" | "mainnet-signing-locked";

export interface WidgetData {
  view: WalletView;
  summary?: WalletSummary;
  intent?: PaymentIntent;
  confirmationToken?: string;
  signUrl?: string;
  policyExplanation?: string;
  explorerUrl?: string | null;
  transactions?: TransactionRecord[];
  events?: AuditEvent[];
  chainValid?: boolean;
  policy?: AgentPolicy;
  policies?: AgentPolicy[];
  draft?: Partial<AgentPolicy>;
  decision?: { decision: string; explanation: string; reasonCodes: string[] };
  subject?: string;
  expiresAt?: string;
  error?: { code: string; message: string };
  pairingUrl?: string;
  connection?: { addresses: Record<string, string>; connectedAt: string } | null;
  networks?: Record<string, MainnetNetwork>;
}

declare global {
  interface Window {
    openai?: {
      toolOutput?: WidgetData;
      toolResponseMetadata?: Record<string, unknown>;
      theme?: "light" | "dark";
      displayMode?: "inline" | "pip" | "fullscreen";
      widgetState?: Record<string, unknown>;
      callTool?: (name: string, args: Record<string, unknown>) => Promise<{ structuredContent?: WidgetData }>;
      requestDisplayMode?: (args: { mode: "inline" | "pip" | "fullscreen" }) => Promise<unknown>;
      openExternal?: (args: { href: string }) => Promise<unknown>;
      setWidgetState?: (state: Record<string, unknown>) => Promise<void>;
    };
  }
}
