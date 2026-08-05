// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostResultFingerprint, hostWidgetData, McpAppsBridge } from "./mcp-bridge.js";

function setOpenAI(value: Record<string, unknown>): void {
  Object.defineProperty(window, "openai", { configurable: true, writable: true, value });
}

describe("MCP Apps bridge reliability", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete window.openai;
  });

  it("prefers the embedded MCP bridge and answers from its tools/call response", async () => {
    // A host that answers the handshake and tools/call over the message
    // channel, the way ChatGPT desktop does. The proven desktop transport
    // must win whenever it works; the compatibility API must stay untouched.
    const host = {
      postMessage: vi.fn((message: { jsonrpc?: string; id?: number; method?: string }) => {
        if (message?.jsonrpc !== "2.0" || typeof message.id !== "number") return;
        const result = message.method === "tools/call"
          ? { structuredContent: { view: "wallet" } }
          : {};
        window.dispatchEvent(new MessageEvent("message", {
          data: { jsonrpc: "2.0", id: message.id, result },
          source: host as unknown as Window
        }));
      })
    };
    const callTool = vi.fn();
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(host as unknown as Window);

    await expect(bridge.callTool("render_wallet", {}, { emit: false })).resolves.toMatchObject({ view: "wallet" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("falls back to the ChatGPT tool API exactly once when the handshake stalls", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const host = { postMessage } as unknown as Window;
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { view: "wallet" } });
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(host);

    const resultPromise = bridge.callTool("render_wallet", {}, { emit: false });
    await vi.advanceTimersByTimeAsync(3_600);   // let ui/initialize time out
    await expect(resultPromise).resolves.toEqual({ view: "wallet" });
    expect(postMessage).toHaveBeenCalled();      // the bridge was tried first
    expect(callTool).toHaveBeenCalledTimes(1);   // then the fallback, once
    expect(callTool).toHaveBeenCalledWith("render_wallet", {});
  });

  it("accepts a pushed confirm_transfer result with the transaction-status view", async () => {
    vi.useFakeTimers();
    const callTool = vi.fn().mockResolvedValue(undefined);
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(window);

    const resultPromise = bridge.callTool("confirm_transfer", { transferIntentId: "intent-9" }, { emit: false });
    window.setTimeout(() => {
      (window.openai as unknown as Record<string, unknown>).toolOutput = {
        structuredContent: { view: "transaction-status", intent: { id: "intent-9", status: "broadcast" } }
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    }, 250);

    await vi.advanceTimersByTimeAsync(300);
    // confirm_transfer reports send progress as transaction-status; the filter
    // discarding it made every send look like it failed after signing.
    await expect(resultPromise).resolves.toMatchObject({ view: "transaction-status" });
  });

  it("reads an Android transfer result delivered through toolResponse", async () => {
    vi.useFakeTimers();
    const callTool = vi.fn().mockResolvedValue(undefined);
    setOpenAI({
      callTool,
      toolOutput: { structuredContent: { view: "wallet" } }
    });
    const bridge = new McpAppsBridge(window);

    const resultPromise = bridge.callTool("prepare_casper_transfer", {
      recipient: `01${"ab".repeat(32)}`,
      amount: "2.5",
      idempotencyKey: "android-test-1"
    }, { emit: false });

    window.setTimeout(() => {
      (window.openai as unknown as Record<string, unknown>).toolResponse = {
        result: { structuredContent: { view: "transfer-preview", intent: { id: "intent-1" } } }
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    }, 250);

    await vi.advanceTimersByTimeAsync(300);
    await expect(resultPromise).resolves.toMatchObject({ view: "transfer-preview" });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("reads the canonical ChatGPT mcp_tool_result metadata envelope", async () => {
    vi.useFakeTimers();
    const callTool = vi.fn().mockResolvedValue(undefined);
    setOpenAI({
      callTool,
      toolOutput: { view: "wallet" },
      toolResponseMetadata: { status: "completed" }
    });
    const bridge = new McpAppsBridge(window);

    const resultPromise = bridge.callTool("prepare_casper_transfer", {
      recipient: `01${"ef".repeat(32)}`,
      amount: "5",
      idempotencyKey: "android-metadata-1"
    }, { emit: false });

    window.setTimeout(() => {
      (window.openai as unknown as Record<string, unknown>).toolResponseMetadata = {
        status: "completed",
        mcp_tool_result: {
          structuredContent: { view: "transfer-preview", intent: { id: "intent-metadata" } }
        }
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    }, 250);

    await vi.advanceTimersByTimeAsync(300);
    await expect(resultPromise).resolves.toMatchObject({
      view: "transfer-preview",
      intent: { id: "intent-metadata" }
    });
  });

  it("hands a lost Android Casper result to the chat with the same idempotency key", async () => {
    vi.useFakeTimers();
    const callTool = vi.fn().mockResolvedValue(undefined);
    const sendFollowUpMessage = vi.fn().mockResolvedValue(undefined);
    setOpenAI({ callTool, sendFollowUpMessage, toolOutput: { structuredContent: { view: "wallet" } } });
    const bridge = new McpAppsBridge(window);
    const recipient = `01${"cd".repeat(32)}`;

    const resultPromise = bridge.callTool("prepare_casper_transfer", {
      recipient,
      amount: "5",
      idempotencyKey: "android-handoff-1"
    }, { emit: false });

    await vi.advanceTimersByTimeAsync(12_100);
    await expect(resultPromise).resolves.toMatchObject({
      view: "error",
      error: { code: "MOBILE_HANDOFF" }
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(sendFollowUpMessage).toHaveBeenCalledWith({
      prompt: expect.stringContaining("android-handoff-1")
    });
    expect(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt).toContain(recipient);
    expect(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt).toContain("amount=5");
  });

  it("includes all supported result slots in the host fingerprint", () => {
    setOpenAI({
      toolOutput: { structuredContent: { view: "wallet" } },
      toolResponseMetadata: {
        call_tool_result: { structuredContent: { view: "transfer-preview" } }
      },
      toolResult: { structuredContent: { view: "receipt" } }
    });
    expect(hostWidgetData()).toMatchObject({ view: "wallet" });
    expect(hostResultFingerprint()).toContain("wallet");
    expect(hostResultFingerprint()).toContain("transfer-preview");
    expect(hostResultFingerprint()).toContain("receipt");
  });
});