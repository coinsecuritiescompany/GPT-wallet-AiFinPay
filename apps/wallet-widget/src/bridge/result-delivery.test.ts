// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { hostWidgetData, widgetDataFrom } from "./mcp-bridge.js";

afterEach(() => {
  delete (window as unknown as { openai?: unknown }).openai;
});

describe("mobile tool-result normalization", () => {
  it("uses structuredContent from a call response", () => {
    const direct = { view: "transfer-preview" };
    expect(widgetDataFrom({ structuredContent: direct })).toBe(direct);
  });

  it("accepts a direct response envelope", () => {
    const direct = { view: "transfer-preview" };
    expect(widgetDataFrom(direct)).toBe(direct);
  });

  it("reads a nested mobile result envelope", () => {
    const pushed = { view: "transfer-preview" };
    expect(widgetDataFrom({ result: { structuredContent: pushed } })).toBe(pushed);
  });

  it("hydrates initial data from a wrapped toolOutput", () => {
    const wallet = { view: "wallet", summary: { mode: "MAINNET" } };
    (window as unknown as { openai: unknown }).openai = { toolOutput: { structuredContent: wallet } };
    expect(hostWidgetData()).toBe(wallet);
  });

  it("supports the toolResult compatibility global", () => {
    const wallet = { view: "wallet", summary: { mode: "MAINNET" } };
    (window as unknown as { openai: unknown }).openai = { toolResult: { result: { structuredContent: wallet } } };
    expect(hostWidgetData()).toBe(wallet);
  });

  it("supports the toolResponse compatibility global", () => {
    const wallet = { view: "wallet", summary: { mode: "MAINNET" } };
    (window as unknown as { openai: unknown }).openai = { toolResponse: { data: wallet } };
    expect(hostWidgetData()).toBe(wallet);
  });

  it("rejects empty envelopes", () => {
    expect(widgetDataFrom(undefined)).toBeUndefined();
    expect(widgetDataFrom({ structuredContent: {} })).toBeUndefined();
  });
});
