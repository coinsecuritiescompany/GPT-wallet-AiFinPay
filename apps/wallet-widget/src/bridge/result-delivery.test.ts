// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

// A tool result reaches a widget by different routes depending on the host
// build. Desktop completes the MCP Apps postMessage handshake and returns the
// payload in the call response. Some mobile builds expose window.openai but
// never complete that handshake: the call resolves with nothing usable and the
// payload appears on window.openai.toolOutput instead — sometimes announced by
// an openai:set_globals event, sometimes not announced at all.
//
// Treating the empty response as the answer is what showed "The wallet service
// returned no response" on a phone while the same build worked on desktop.
type Payload = { view?: string } | undefined;

function resolveResult(response: { structuredContent?: Payload }, global: Payload, before: Payload): Payload {
  const direct = response.structuredContent;
  if (direct?.view) return direct;
  if (global?.view && global !== before) return global;
  return undefined;
}

describe("where a tool result actually arrives", () => {
  it("uses the call response when the host provides one", () => {
    const direct = { view: "transfer-preview" };
    expect(resolveResult({ structuredContent: direct }, undefined, undefined)).toBe(direct);
  });

  it("falls back to the toolOutput global when the response is empty", () => {
    const pushed = { view: "transfer-preview" };
    expect(resolveResult({}, pushed, undefined)).toBe(pushed);
  });

  it("ignores a global left over from an earlier call", () => {
    const stale = { view: "wallet" };
    expect(resolveResult({}, stale, stale)).toBeUndefined();
  });

  it("accepts a new global even when the previous one had the same view", () => {
    const stale = { view: "wallet" };
    const fresh = { view: "wallet" };
    expect(resolveResult({}, fresh, stale)).toBe(fresh);
  });

  it("reports nothing when neither route produced a usable payload", () => {
    expect(resolveResult({}, undefined, undefined)).toBeUndefined();
    expect(resolveResult({ structuredContent: {} }, {}, undefined)).toBeUndefined();
  });
});
