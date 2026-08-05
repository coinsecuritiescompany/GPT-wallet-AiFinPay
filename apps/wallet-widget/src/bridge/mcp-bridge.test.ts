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

  it("uses the direct ChatGPT tool API exactly once when it is available", async () => {
    const postMessage = vi.fn();
    const host = { postMessage } as unknown as Window;
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { view: "wallet" } });
    setOpenAI({ callTool });
    const bridge = new McpAppsBridge(host);

    await expect(bridge.callTool("render_wallet", {}, { emit: false })).resolves.toEqual({ view: "wallet" });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith("render_wallet", {});
    expect(postMessage).not.toHaveBeenCalled();
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

  it("includes all supported result slots in the host fingerprint", () => {
    setOpenAI({
      toolOutput: { structuredContent: { view: "wallet" } },
      toolResult: { structuredContent: { view: "receipt" } }
    });
    expect(hostWidgetData()).toMatchObject({ view: "wallet" });
    expect(hostResultFingerprint()).toContain("wallet");
    expect(hostResultFingerprint()).toContain("receipt");
  });
});
