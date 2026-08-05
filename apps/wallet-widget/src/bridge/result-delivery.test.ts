// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

type Payload = { view?: string; structuredContent?: Payload; result?: Payload; data?: Payload; output?: Payload; intent?: unknown } | undefined;

function widgetDataFrom(value: Payload): Payload {
  if (!value) return undefined;
  if (value.view) return value;
  for (const nested of [value.structuredContent, value.result, value.data, value.output]) {
    const candidate = widgetDataFrom(nested);
    if (candidate) return candidate;
  }
  return undefined;
}

function fingerprint(value: Payload): string {
  const data = widgetDataFrom(value);
  return data ? JSON.stringify(data) : "";
}

function expectedViewsForTool(name: string): Set<string> | null {
  if (name === "open_wallet" || name === "get_wallet_summary") return new Set(["wallet", "error", "not-connected"]);
  if (name.startsWith("prepare_") && name.endsWith("_transfer")) return new Set(["transfer-preview", "blocked", "error", "mainnet-signing-locked"]);
  return null;
}

function accepts(name: string, payload: Payload): boolean {
  const data = widgetDataFrom(payload);
  if (!data?.view) return false;
  const expected = expectedViewsForTool(name);
  return !expected || expected.has(data.view);
}

function resolveResult(name: string, response: Payload, global: Payload, beforeFingerprint: string): Payload {
  const direct = widgetDataFrom(response);
  if (direct && accepts(name, direct)) return direct;
  const pushed = widgetDataFrom(global);
  if (pushed && accepts(name, pushed) && fingerprint(global) !== beforeFingerprint) return pushed;
  return undefined;
}

describe("where a tool result actually arrives", () => {
  it("uses structuredContent from the call response", () => {
    const direct = { view: "transfer-preview" };
    expect(resolveResult("prepare_casper_transfer", { structuredContent: direct }, undefined, "")).toBe(direct);
  });

  it("reads a nested mobile toolOutput envelope", () => {
    const pushed = { view: "transfer-preview" };
    expect(resolveResult("prepare_casper_transfer", undefined, { result: { structuredContent: pushed } }, "")).toBe(pushed);
  });

  it("detects an in-place mutation of the same global object", () => {
    const global: Payload = { view: "wallet" };
    const before = fingerprint(global);
    global.view = "transfer-preview";
    global.intent = { id: "new-intent" };
    expect(resolveResult("prepare_casper_transfer", undefined, global, before)?.view).toBe("transfer-preview");
  });

  it("rejects a replayed wallet payload while Casper preparation is pending", () => {
    const before = fingerprint({ view: "transfer-form" });
    expect(resolveResult("prepare_casper_transfer", undefined, { view: "wallet" }, before)).toBeUndefined();
  });

  it("accepts wallet payload for open_wallet", () => {
    const wallet = { view: "wallet" };
    expect(resolveResult("open_wallet", wallet, undefined, "")).toBe(wallet);
  });

  it("ignores an unchanged result left over from an earlier call", () => {
    const stale = { view: "wallet" };
    expect(resolveResult("open_wallet", undefined, stale, fingerprint(stale))).toBeUndefined();
  });
});
