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

  it("prefers canonical MCP tools/call when embedded", async () => {
    const host = {} as Window;
    const postMessage = vi.fn((message: unknown) => {
      const request = message as { id?: number; method?: string };
      if (typeof request.id !== "number") return;
      const result = request.method === "ui/initialize"
        ? { hostContext: { platform: "android" } }
        : { structuredContent: { view: "wallet" } };
      window.setTimeout(() => {
        window.dispatchEvent(new MessageEvent("message", {
          source: host,
          data: { jsonrpc: "2.0", id: request.id, result }
        }));
      }, 0);
    });
    Object.assign(host, { postMessage });
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { view: "error" } });
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(host);

    await expect(bridge.callTool("render_wallet", {}, { emit: false })).resolves.toEqual({ view: "wallet" });
    expect(callTool).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: "ui/initialize" }), "*");
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ method: "tools/call" }), "*");
  });

  it("uses the ChatGPT compatibility API outside an embedded MCP host", async () => {
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { view: "wallet" } });
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(window);

    await expect(bridge.callTool("render_wallet", {}, { emit: false })).resolves.toEqual({ view: "wallet" });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith("render_wallet", {});
  });

  it("reads an Android transfer result delivered through toolResponse", async () => {
    vi.useFakeTimers();
    const callTool = vi.fn().mockResolvedValue(undefined);
    setOpenAI({ callTool, toolOutput: { structuredContent: { view: "wallet" } } });
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
    setOpenAI({ callTool, toolOutput: { view: "wallet" }, toolResponseMetadata: { status: "completed" } });
    const bridge = new McpAppsBridge(window);

    const resultPromise = bridge.callTool("prepare_casper_transfer", {
      recipient: `01${"ef".repeat(32)}`,
      amount: "5",
      idempotencyKey: "android-metadata-1"
    }, { emit: false });

    window.setTimeout(() => {
      (window.openai as unknown as Record<string, unknown>).toolResponseMetadata = {
        status: "completed",
        mcp_tool_result: { structuredContent: { view: "transfer-preview", intent: { id: "intent-metadata" } } }
      };
      window.dispatchEvent(new Event("openai:set_globals"));
    }, 250);

    await vi.advanceTimersByTimeAsync(300);
    await expect(resultPromise).resolves.toMatchObject({ view: "transfer-preview", intent: { id: "intent-metadata" } });
  });

  it("hands a lost compatibility result to the chat with the same idempotency key", async () => {
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

    await vi.advanceTimersByTimeAsync(8_100);
    await expect(resultPromise).resolves.toMatchObject({ view: "error", error: { code: "MOBILE_HANDOFF" } });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(sendFollowUpMessage).toHaveBeenCalledTimes(1);
    expect(sendFollowUpMessage).toHaveBeenCalledWith({ prompt: expect.stringContaining("android-handoff-1") });
    expect(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt).toContain(recipient);
    expect(sendFollowUpMessage.mock.calls[0]?.[0]?.prompt).toContain("amount=5");
  });

  it("uses MCP ui/message for an embedded Android handoff even when legacy follow-up exists", async () => {
    vi.useFakeTimers();
    const host = {} as Window;
    const postMessage = vi.fn((message: unknown) => {
      const request = message as { id?: number; method?: string };
      if (typeof request.id !== "number") return;
      const result = request.method === "ui/initialize"
        ? { hostContext: { platform: "android" } }
        : undefined;
      window.setTimeout(() => {
        window.dispatchEvent(new MessageEvent("message", {
          source: host,
          data: { jsonrpc: "2.0", id: request.id, result }
        }));
      }, 0);
    });
    Object.assign(host, { postMessage });
    const callTool = vi.fn().mockResolvedValue(undefined);
    const sendFollowUpMessage = vi.fn().mockResolvedValue(undefined);
    setOpenAI({ callTool, sendFollowUpMessage, toolOutput: { structuredContent: { view: "wallet" } } });
    const bridge = new McpAppsBridge(host);

    const resultPromise = bridge.callTool("prepare_casper_transfer", {
      recipient: `01${"aa".repeat(32)}`,
      amount: "5",
      idempotencyKey: "android-ui-message-1"
    }, { emit: false });

    await vi.advanceTimersByTimeAsync(16_100);
    await expect(resultPromise).resolves.toMatchObject({ view: "error", error: { code: "MOBILE_HANDOFF" } });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      method: "ui/message",
      params: expect.objectContaining({
        role: "user",
        content: [expect.objectContaining({ text: expect.stringContaining("android-ui-message-1") })]
      })
    }), "*");
    expect(sendFollowUpMessage).not.toHaveBeenCalled();
  });

  it("includes all supported result slots in the host fingerprint", () => {
    setOpenAI({
      toolOutput: { structuredContent: { view: "wallet" } },
      toolResponseMetadata: { call_tool_result: { structuredContent: { view: "transfer-preview" } } },
      toolResult: { structuredContent: { view: "receipt" } }
    });
    expect(hostWidgetData()).toMatchObject({ view: "wallet" });
    expect(hostResultFingerprint()).toContain("wallet");
    expect(hostResultFingerprint()).toContain("transfer-preview");
    expect(hostResultFingerprint()).toContain("receipt");
  });
});