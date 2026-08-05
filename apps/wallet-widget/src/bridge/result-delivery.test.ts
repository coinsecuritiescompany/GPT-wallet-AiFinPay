// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

type Payload = { view?: string; structuredContent?: Payload; result?: Payload; intent?: unknown } | undefined;

function widgetDataFrom(value: Payload): Payload {
  if (!value) return undefined;
  if (value.view) return value;
  if (value.structuredContent?.view) return value.structuredContent;
  if (value.result) return widgetDataFrom(value.result);
  return undefined;
}

function fingerprint(value: Payload): string {
  const data = widgetDataFrom(value);
  return data ? JSON.stringify(data) : "";
}

function resolveResult(response: Payload, global: Payload, beforeFingerprint: string): Payload {
  const direct = widgetDataFrom(response);
  if (direct) return direct;
  const pushed = widgetDataFrom(global);
  if (pushed && fingerprint(global) !== beforeFingerprint) return pushed;
  return undefined;
}

describe("where a tool result actually arrives", () => {
  it("uses structuredContent from the call response", () => {
    const direct = { view: "transfer-preview" };
    expect(resolveResult({ structuredContent: direct }, undefined, "")).toBe(direct);
  });

  it("accepts a direct response envelope", () => {
    const direct = { view: "transfer-preview" };
    expect(resolveResult(direct, undefined, "")).toBe(direct);
  });

  it("reads a nested mobile toolOutput envelope", () => {
    const pushed = { view: "transfer-preview" };
    expect(resolveResult(undefined, { result: { structuredContent: pushed } }, "")).toBe(pushed);
  });

  it("detects an in-place mutation of the same global object", () => {
    const global: Payload = { view: "wallet" };
    const before = fingerprint(global);
    global.view = "transfer-preview";
    global.intent = { id: "new-intent" };
    expect(resolveResult(undefined, global, before)?.view).toBe("transfer-preview");
  });

  it("ignores an unchanged result left over from an earlier call", () => {
    const stale = { view: "wallet" };
    expect(resolveResult(undefined, stale, fingerprint(stale))).toBeUndefined();
  });

  it("reports nothing when no route produced a usable payload", () => {
    expect(resolveResult(undefined, undefined, "")).toBeUndefined();
    expect(resolveResult({ structuredContent: {} }, {}, "")).toBeUndefined();
  });
});
