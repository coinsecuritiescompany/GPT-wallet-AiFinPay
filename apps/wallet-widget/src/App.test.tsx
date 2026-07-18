// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { bridge } from "./bridge/mcp-bridge.js";
import { browserDemoData } from "./demo-data.js";

describe("AiFinPay wallet widget", () => {
  afterEach(() => cleanup());
  it("renders wallet overview", () => {
    render(<App initialData={browserDemoData} />);
    expect(screen.getByText("2,543.68")).toBeInTheDocument();
    expect(screen.getByText("BETA")).toBeInTheDocument();
    expect(screen.getByText("Agent payment")).toBeInTheDocument();
  });

  it("renders blocked policy state", () => {
    render(<App initialData={{ view: "blocked", decision: { decision: "BLOCKED", explanation: "The amount exceeds the limit.", reasonCodes: ["PER_TRANSACTION_LIMIT_EXCEEDED"] } }} />);
    expect(screen.getByText("Blocked by AiFinPay Policy Engine")).toBeInTheDocument();
    expect(screen.getByText("PER TRANSACTION LIMIT EXCEEDED")).toBeInTheDocument();
  });

  it("renders a transaction receipt", () => {
    const tx = browserDemoData.summary!.latestTransactions[0]!;
    render(<App initialData={{ view: "receipt", intent: { id: "pi", ownerUserId: "u", walletId: "w", initiatedByType: "AGENT", initiatedById: "research-agent", recipient: tx.recipient, token: "USDC", tokenAddress: "0x0", amount: "0.10", amountBaseUnits: "100000", network: "POLYGON_AMOY", chainId: 80002, estimatedFee: "0.0012 POL", status: "COMPLETED", policyDecision: "AUTO_APPROVED", policyReasonCodes: ["ALLOWED_WITHIN_POLICY"], riskLevel: "LOW", createdAt: tx.timestamp, expiresAt: tx.timestamp, submittedAt: tx.timestamp, transactionHash: tx.transactionHash, idempotencyKey: "receipt-test", auditReceiptId: tx.auditReceiptId } }} />);
    expect(screen.getByText("Demo payment complete")).toBeInTheDocument();
    expect(screen.getByText("receipt-demo-1")).toBeInTheDocument();
  });

  it("calls the policy tool from Agent limits", () => {
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "policies", policies: [] });
    render(<App initialData={browserDemoData} />); fireEvent.click(screen.getByText("Agent limits"));
    expect(call).toHaveBeenCalledWith("list_agent_policies", {}); call.mockRestore();
  });
});
