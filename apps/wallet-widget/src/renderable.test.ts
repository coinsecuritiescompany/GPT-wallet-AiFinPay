// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isRenderable } from "./App.js";

// A reloaded conversation restores the last tool output, but nested objects do
// not always survive that round trip. Components reach for those objects with
// non-null assertions, so a stripped payload threw during render — and with no
// boundary the host reported "Error loading app / Runtime error" with a Retry
// that could not help, because it re-rendered the same bad state. Only a new
// chat recovered. This guards the payload before it can reach a component.
describe("restored payloads that would crash the widget", () => {
  it("rejects views whose required data did not survive the round trip", () => {
    expect(isRenderable({ view: "receipt" } as never)).toBe(false);
    expect(isRenderable({ view: "transfer-preview" } as never)).toBe(false);
    expect(isRenderable({ view: "swap-quote" } as never)).toBe(false);
    expect(isRenderable({ view: "swap-order" } as never)).toBe(false);
    expect(isRenderable({ view: "swap-status" } as never)).toBe(false);
    expect(isRenderable({ view: "wallet" } as never)).toBe(false);
  });

  it("accepts the same views once their data is present", () => {
    expect(isRenderable({ view: "receipt", intent: { id: "i" } } as never)).toBe(true);
    expect(isRenderable({ view: "wallet", summary: { mode: "MAINNET" } } as never)).toBe(true);
    expect(isRenderable({ view: "swap-quote", quote: { fromAmount: "1" } } as never)).toBe(true);
  });

  it("accepts views that need no extra data, including blocked", () => {
    // Blocked reads data.intent optionally and falls back to data.decision,
    // so guarding it would hide a legitimate policy refusal.
    for (const view of ["loading", "wallet-connect", "transfer-form", "receive", "networks", "error", "blocked"]) {
      expect(isRenderable({ view } as never)).toBe(true);
    }
  });

  it("rejects an absent or viewless payload", () => {
    expect(isRenderable(undefined)).toBe(false);
    expect(isRenderable({} as never)).toBe(false);
  });
});
