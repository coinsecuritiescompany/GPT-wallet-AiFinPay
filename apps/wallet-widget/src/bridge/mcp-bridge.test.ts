// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpAppsBridge } from "./mcp-bridge.js";

describe("MCP Apps bridge reliability", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete window.openai;
  });

  it("falls back to the ChatGPT compatibility tool API when mobile initialization times out", async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const host = { postMessage } as unknown as Window;
    const callTool = vi.fn().mockResolvedValue({ structuredContent: { view: "wallet" } });
    window.openai = { callTool };
    const bridge = new McpAppsBridge(host);

    const resultPromise = bridge.callTool("render_wallet", {}, { emit: false });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      jsonrpc: "2.0",
      method: "ui/initialize"
    }), "*");

    await vi.advanceTimersByTimeAsync(3_500);
    await expect(resultPromise).resolves.toEqual({ view: "wallet" });
    expect(callTool).toHaveBeenCalledWith("render_wallet", {});
  });
});
