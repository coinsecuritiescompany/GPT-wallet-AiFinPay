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
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}`, casper: `01${"c".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "POLYGON" as const, balances: [{ token: "USDC" as const, raw: "0", formatted: "0", decimals: 6 }, { token: "POL" as const, raw: "0", formatted: "0", decimals: 18 }], latestTransactions: [] };
    const call = vi.spyOn(bridge, "callTool").mockImplementation(async (name) => name === "get_wallet_connection" ? { view: "wallet-connected", connection } : { view: "wallet", connection, summary });
    render(<App initialData={{ view: "wallet-connect", pairingUrl: "https://wallet.example/vault?pair=test", expiresAt: "2026-07-18T10:10:00.000Z" }} />);
    await waitFor(() => expect(screen.getByText("Polygon Mainnet")).toBeInTheDocument());
    expect(call).toHaveBeenCalledWith("get_wallet_connection", {}, { emit: false });
    expect(call).toHaveBeenCalledWith("render_wallet", {}, { emit: false });
    call.mockRestore();
  });

  it("skips the wallet-created interstitial for an existing connection", async () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}`, casper: `01${"c".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "POLYGON" as const, balances: [{ token: "USDC" as const, raw: "0", formatted: "0", decimals: 6 }, { token: "POL" as const, raw: "0", formatted: "0", decimals: 18 }], latestTransactions: [] };
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "wallet", connection, summary });
    render(<App initialData={{ view: "wallet-connected", connection }} />);
    await waitFor(() => expect(screen.getByText("Polygon Mainnet")).toBeInTheDocument());
    expect(screen.queryByText("WALLET CREATED")).not.toBeInTheDocument();
    call.mockRestore();
  });

  it("renders honest Polygon mainnet data and the receive address", () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}`, casper: `01${"c".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "POLYGON" as const, balances: [{ token: "USDC" as const, raw: "0", formatted: "0", decimals: 6 }, { token: "POL" as const, raw: "0", formatted: "0", decimals: 18 }], latestTransactions: [] };
    render(<App initialData={{ view: "wallet", summary, connection }} />);
    expect(screen.getByText("MAINNET")).toBeInTheDocument();
    expect(screen.getByText("Polygon Mainnet")).toBeInTheDocument();
    expect(screen.getByText("Live RPC balance")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Receive"));
    expect(screen.getByText("Receive assets")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Casper · CSPR" })).toBeInTheDocument();
    expect(screen.getByTitle("Polygon wallet address QR code")).toBeInTheDocument();
    expect(screen.getByText(connection.addresses.evm)).toBeInTheDocument();
  });

  it("opens the 13-network selector and fetches the selected network's live balance", async () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}`, casper: `01${"c".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "POLYGON" as const, balances: [{ token: "USDC" as const, raw: "0", formatted: "0", decimals: 6 }, { token: "POL" as const, raw: "0", formatted: "0", decimals: 18 }], latestTransactions: [] };
    const solanaSummary = { ...summary, selectedNetwork: "SOLANA" as const, balances: [{ token: "SOL", raw: "2500000000", formatted: "2.5", decimals: 9 }] };
    // Switching networks calls get_wallet_summary; the bridge emits the result to subscribers.
    const call = vi.spyOn(bridge, "callTool").mockImplementation(async () => { const next = { view: "wallet" as const, summary: solanaSummary, connection }; (bridge as unknown as { emit: (d: unknown) => void }).emit(next); return next; });
    render(<App initialData={{ view: "wallet", summary, connection }} />);
    const selector = screen.getByRole("button", { name: "Choose network. Current: Polygon Mainnet" });
    fireEvent.click(selector);
    expect(screen.getByRole("dialog", { name: "Choose network" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(13);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Casper");
    expect(screen.getByTestId("network-logo-botchain")).toBeInTheDocument();
    expect(screen.getByTestId("network-logo-casper")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^network-logo-/)).toHaveLength(14);
    fireEvent.click(screen.getByRole("option", { name: /Solana/ }));
    expect(call).toHaveBeenCalledWith("get_wallet_summary", { network: "SOLANA" });
    expect(screen.getByRole("button", { name: "Choose network. Current: Solana" })).toBeInTheDocument();
    expect(screen.getByTestId("network-logo-solana")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Live Solana balance")).toBeInTheDocument());
    expect(screen.getByText("SOL")).toBeInTheDocument();
    call.mockRestore();
  });

  it("shows Casper first on Receive and copies its exact public address", async () => {
    const connection = { addresses: { evm: "0x1111111111111111111111111111111111111111", solana: "5L7xB9arfakeaddress111111111111111", near: "a".repeat(64), aptos: `0x${"b".repeat(64)}`, casper: `01${"c".repeat(64)}` }, connectedAt: "2026-07-18T10:00:00.000Z" };
    const summary = { ...browserDemoData.summary!, mode: "MAINNET" as const, selectedNetwork: "CASPER" as const, latestTransactions: [] };
    render(<App initialData={{ view: "wallet", summary, connection }} />);
    fireEvent.click(screen.getByText("Receive"));
    const select = screen.getByRole("combobox", { name: "Receive network" });
    expect((select.querySelector("option") as HTMLOptionElement).value).toBe("casper");
    expect(screen.getByTitle("Casper wallet address QR code")).toBeInTheDocument();
    expect(screen.getByText(connection.addresses.casper)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy wallet address" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied ✓" })).toBeInTheDocument());
  });

  it("builds a Casper-to-Polygon quote request from live provider assets", async () => {
    const assets = [
      { ticker: "pol", name: "Polygon", network: "matic" },
      { ticker: "cspr", name: "Casper", network: "cspr" },
      { ticker: "usdc", name: "USD Coin", network: "matic" }
    ];
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "swap-quote" });
    render(<App initialData={{ view: "swap-form", assets }} />);
    expect(screen.getByRole("combobox", { name: "Swap from asset" })).toHaveValue("cspr:cspr");
    fireEvent.change(screen.getByRole("textbox", { name: "Swap amount" }), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Review swap" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("get_swap_quote", {
      fromAsset: assets[1], toAsset: assets[0], fromAmount: "10"
    }));
    call.mockRestore();
  });

  it("requires explicit quote confirmation before creating a swap order", async () => {
    const quote = {
      provider: "CHANGENOW" as const,
      fromAsset: { ticker: "cspr", name: "Casper", network: "cspr" },
      toAsset: { ticker: "pol", name: "Polygon", network: "matic" },
      fromAmount: "10", estimatedAmount: "112.45", validUntil: new Date(Date.now() + 60_000).toISOString()
    };
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "swap-order" });
    render(<App initialData={{ view: "swap-quote", quote, quoteToken: "signed-quote-token" }} />);
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm swap of 10 CSPR" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("create_swap_order", { quoteToken: "signed-quote-token", confirmed: true }));
    call.mockRestore();
  });

  it("renders a swap deposit QR and hands Polygon funding to the Vault", async () => {
    const order = {
      provider: "CHANGENOW" as const, id: "order_123456", status: "new",
      fromAsset: { ticker: "pol", name: "Polygon", network: "matic" },
      toAsset: { ticker: "cspr", name: "Casper", network: "cspr" },
      fromAmount: "1.5", expectedAmount: "15", payinAddress: "0x2222222222222222222222222222222222222222",
      payoutAddress: `01${"c".repeat(64)}`, createdAt: new Date().toISOString()
    };
    const call = vi.spyOn(bridge, "callTool").mockResolvedValue({ view: "transfer-preview" });
    render(<App initialData={{ view: "swap-order", order, orderReference: "signed-order-reference" }} />);
    expect(screen.getByTitle("Swap deposit address QR code")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review deposit in AiFinPay Vault" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("prepare_transfer", {
      recipient: order.payinAddress, amount: "1.5", token: "NATIVE", network: "POLYGON", idempotencyKey: "swap-order_123456"
    }));
    call.mockRestore();
  });

  it("never substitutes Polygon native currency for an unsupported token deposit", () => {
    const order = {
      provider: "CHANGENOW" as const, id: "order_unsupported", status: "new",
      fromAsset: { ticker: "usdt", name: "Tether", network: "matic" },
      toAsset: { ticker: "cspr", name: "Casper", network: "cspr" },
      fromAmount: "10", expectedAmount: "20", payinAddress: "0x3333333333333333333333333333333333333333",
      payoutAddress: `01${"c".repeat(64)}`, createdAt: new Date().toISOString()
    };
    render(<App initialData={{ view: "swap-order", order, orderReference: "signed-order-reference" }} />);
    expect(screen.queryByRole("button", { name: "Review deposit in AiFinPay Vault" })).not.toBeInTheDocument();
    expect(screen.getByText(/AiFinPay will never substitute another asset/)).toBeInTheDocument();
  });
});
