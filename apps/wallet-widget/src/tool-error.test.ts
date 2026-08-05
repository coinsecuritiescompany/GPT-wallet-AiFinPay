import { describe, expect, it } from "vitest";

// The MCP tools resolve with { view: "error", error } rather than rejecting, so
// a refused transfer looks to the caller like a successful call. A form that
// only used try/catch showed nothing at all: the button flipped back to its
// resting label and the reason was discarded. That is exactly what a partner hit
// on a real Casper send — "checking policy" then straight back to the button,
// with no clue that the wallet was short of CSPR.
function toolErrorMessage(result: unknown, fallback: string): string | null {
  const view = (result as { view?: unknown } | null)?.view;
  if (view !== "error" && view !== "blocked") return null;
  const error = (result as { error?: { message?: unknown } } | null)?.error;
  const message = typeof error?.message === "string" ? error.message : "";
  return message.trim() || fallback;
}

describe("surfacing tool errors that resolve rather than throw", () => {
  it("returns the server's message for an error view", () => {
    expect(toolErrorMessage(
      { view: "error", error: { code: "INSUFFICIENT_FUNDS", message: "Insufficient CSPR for the transfer amount and its 0.1 CSPR fee." } },
      "fallback"
    )).toBe("Insufficient CSPR for the transfer amount and its 0.1 CSPR fee.");
  });

  it("treats a policy block as something the user must see", () => {
    expect(toolErrorMessage({ view: "blocked", error: { message: "Blocked by policy." } }, "fallback"))
      .toBe("Blocked by policy.");
  });

  it("falls back when the payload carries no usable message", () => {
    expect(toolErrorMessage({ view: "error" }, "fallback")).toBe("fallback");
    expect(toolErrorMessage({ view: "error", error: { message: "   " } }, "fallback")).toBe("fallback");
  });

  it("stays silent on a successful result", () => {
    expect(toolErrorMessage({ view: "transfer-preview", intent: {} }, "fallback")).toBeNull();
    expect(toolErrorMessage(null, "fallback")).toBeNull();
  });
});

describe("a response the router cannot use", () => {
  function toolErrorMessage(result: unknown, fallback: string): string | null {
    const view = (result as { view?: unknown } | null)?.view;
    if (typeof view !== "string" || !view) {
      const text = (result as { content?: Array<{ text?: unknown }> } | null)?.content
        ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean).join(" ").trim();
      return text || "The wallet service returned no response. Reconnect the AiFinPay connector and try again.";
    }
    if (view !== "error" && view !== "blocked") return null;
    const error = (result as { error?: { message?: unknown } } | null)?.error;
    const message = typeof error?.message === "string" ? error.message : "";
    return message.trim() || fallback;
  }

  it("reports a payload with no view rather than leaving the button looking dead", () => {
    // The bridge only navigates when data.view exists, so this case silently
    // did nothing at all — the exact symptom reported from a phone.
    expect(toolErrorMessage({}, "fallback")).toMatch(/no response/i);
    expect(toolErrorMessage({ structuredContent: {} }, "fallback")).toMatch(/no response/i);
  });

  it("surfaces any text the host did return", () => {
    expect(toolErrorMessage({ content: [{ text: "Tool call was not permitted." }] }, "fallback"))
      .toBe("Tool call was not permitted.");
  });

  it("still says nothing on a normal successful view", () => {
    expect(toolErrorMessage({ view: "transfer-preview" }, "fallback")).toBeNull();
  });
});
