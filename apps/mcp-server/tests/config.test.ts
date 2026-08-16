import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("deployment config", () => {
  it("derives public URLs from Render without manual interpolation", () => {
    const config = loadConfig({ PORT: "10000", RENDER_EXTERNAL_HOSTNAME: "aifinpay-wallet.onrender.com" });
    expect(config.publicUrl).toBe("https://aifinpay-wallet.onrender.com/mcp");
    expect(config.widgetDomain).toBe("https://aifinpay-wallet.onrender.com");
  });

  it("keeps explicit public URLs authoritative", () => {
    const config = loadConfig({
      MCP_PUBLIC_URL: "https://wallet.aifinpay.com/mcp",
      WIDGET_PUBLIC_URL: "https://wallet.aifinpay.com",
      RENDER_EXTERNAL_URL: "https://ignored.onrender.com"
    });
    expect(config.publicUrl).toBe("https://wallet.aifinpay.com/mcp");
    expect(config.widgetDomain).toBe("https://wallet.aifinpay.com");
  });

  it("enables Polygon mainnet mode explicitly", () => {
    const config = loadConfig({ AIFINPAY_WALLET_MODE: "mainnet", POLYGON_RPC_URLS: "https://one.example, https://two.example" });
    expect(config.walletMode).toBe("mainnet");
    expect(config.polygonRpcUrls).toEqual(["https://one.example", "https://two.example"]);
  });

  it("defaults wallet reads to Polygon mainnet", () => {
    const config = loadConfig({});
    expect(config.walletMode).toBe("mainnet");
  });

  it("uses demo wallet mode only when explicitly requested", () => {
    const config = loadConfig({ AIFINPAY_WALLET_MODE: "demo" });
    expect(config.walletMode).toBe("demo");
  });

  it("ignores legacy external swap/bridge provider credentials", () => {
    const config = loadConfig({
      CHANGENOW_API_KEY: "must-not-enable",
      SQUID_INTEGRATOR_ID: "must-not-enable",
      CIRCLE_API_KEY: "must-not-enable",
    });
    expect("changeNowApiKey" in config).toBe(false);
    expect("squidIntegratorId" in config).toBe(false);
    expect("circleApiKey" in config).toBe(false);
  });

  it("loads independent route pins separately from the settlement API", () => {
    const pins = {
      "polygon:AIFP-2": {
        target: "0x1111111111111111111111111111111111111111",
        evidenceHash: "ab".repeat(32),
        sourceCommit: "cd".repeat(20)
      }
    };
    const config = loadConfig({ AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON: JSON.stringify(pins) });
    expect(config.settlementPins).toEqual(pins);
  });

  it("rejects malformed or incomplete trusted settlement pins", () => {
    expect(() => loadConfig({ AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON: "{" })).toThrow(/valid JSON/);
    expect(() => loadConfig({ AIFINPAY_TRUSTED_SETTLEMENT_PINS_JSON: JSON.stringify({
      "polygon:AIFP-1": { target: "0x1", evidenceHash: "bad", sourceCommit: "deadbeef" }
    }) })).toThrow(/Incomplete settlement pin/);
  });

  it("refuses insecure remote settlement API origins", () => {
    expect(() => loadConfig({ AIFINPAY_SETTLEMENT_API_ORIGIN: "http://api.example.com" })).toThrow(/must use HTTPS/);
    expect(loadConfig({ AIFINPAY_SETTLEMENT_API_ORIGIN: "http://localhost:3000" }).settlementApiOrigin).toBe("http://localhost:3000");
  });

  it("requires explicit positive execution caps instead of guessing malformed values", () => {
    expect(() => loadConfig({ CASPER_SETTLEMENT_PAYMENT_MOTES: "0" })).toThrow(/positive integer/);
    expect(() => loadConfig({ APTOS_SETTLEMENT_MAX_GAS: "-1" })).toThrow(/positive integer/);
    const config = loadConfig({ CASPER_SETTLEMENT_PAYMENT_MOTES: "3000000000", APTOS_SETTLEMENT_MAX_GAS: "5000" });
    expect(config.casperSettlementPaymentMotes).toBe("3000000000");
    expect(config.aptosSettlementMaxGas).toBe("5000");
  });
});
