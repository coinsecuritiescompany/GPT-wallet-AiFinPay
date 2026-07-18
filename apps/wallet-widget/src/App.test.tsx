// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("updates the pairing widget when the external vault connects", async () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "wallet-connected", connection });
    render(<App initialData={{ view: "wallet-connect", pairingUrl: "https://wallet.example/vault?pair=test", expiresAt: "2026-07-18T10:10:00.000Z" }} />);
    await waitFor(() => expect(screen.getByText("AiFinPay Vault connected")).toBeInTheDocument());
    expect(screen.getByText("WALLET CREATED")).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith("get_wallet_connection", {}, { emit: false });
    call.mockRestore();
  });

  it("renders honest Polygon mainnet data and the receive address", () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "POLYGON" as const, balances: [{ token: "USDC" as const, raw: "0", formatted: "0", decimals: 6 }, { token: "POL" as const, raw: "0", formatted: "0", decimals: 18 }], latestTransactions: [] };
    render(<App initialData={{ view: "wallet", summary, connection }} />);
    expect(screen.getByText("MAINNET")).toBeInTheDocument();
    expect(screen.getByText("Polygon Mainnet")).toBeInTheDocument();
    expect(screen.getByText("Live RPC balance")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Receive"));
    expect(screen.getByText("Receive assets")).toBeInTheDocument();
    expect(screen.getByText("Polygon & EVM networks")).toBeInTheDocument();
  });
});
