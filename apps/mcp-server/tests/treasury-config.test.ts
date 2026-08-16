import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const evm = "0x1111111111111111111111111111111111111111";
const treasuries = {
  polygon: evm,
  avalanche: evm,
  arbitrum: evm,
  bnb: evm,
  base: evm,
  unichain: evm,
  optimism: evm,
  botchain: evm,
  xrplevm: evm,
  solana: "11111111111111111111111111111111",
  near: "11".repeat(32),
  aptos: `0x${"22".repeat(32)}`,
  casper: `01${"33".repeat(32)}`,
};

describe("provider-free treasury accounting config", () => {
  it("is disabled by default and has no movement/provider configuration", () => {
    const config = loadConfig({});
    expect(config.treasury.enabled).toBe(false);
    expect(config.treasury.intervalSeconds).toBe(900);
    expect("centralBaseSafe" in config.treasury).toBe(false);
    expect("signerSecretFile" in config.treasury).toBe(false);
  });

  it("refuses activation without all 13 local treasury addresses", () => {
    expect(() => loadConfig({ AIFINPAY_TREASURY_ACCOUNTING_ENABLED: "true" }))
      .toThrow(/requires AIFINPAY_TREASURY_ADDRESSES_JSON/);
    const incomplete = { ...treasuries } as Record<string, string>;
    delete incomplete.casper;
    expect(() => loadConfig({
      AIFINPAY_TREASURY_ACCOUNTING_ENABLED: "true",
      AIFINPAY_TREASURY_ADDRESSES_JSON: JSON.stringify(incomplete),
    })).toThrow(/Missing local treasury address for casper/);
  });

  it("loads exactly the local-custody accounting configuration", () => {
    const config = loadConfig({
      AIFINPAY_TREASURY_ACCOUNTING_ENABLED: "true",
      AIFINPAY_TREASURY_ADDRESSES_JSON: JSON.stringify(treasuries),
      AIFINPAY_TREASURY_ACCOUNTING_INTERVAL_SECONDS: "1800",
      CHANGENOW_API_KEY: "ignored",
      SQUID_INTEGRATOR_ID: "ignored",
      CIRCLE_API_KEY: "ignored",
    });
    expect(config.treasury.enabled).toBe(true);
    expect(config.treasury.addresses).toEqual(treasuries);
    expect(config.treasury.intervalSeconds).toBe(1800);
    expect("changeNowApiKey" in config).toBe(false);
    expect("squidIntegratorId" in config).toBe(false);
  });

  it("rejects unknown networks, malformed addresses and unsafe intervals", () => {
    expect(() => loadConfig({
      AIFINPAY_TREASURY_ADDRESSES_JSON: JSON.stringify({ ...treasuries, ethereum: evm }),
    })).toThrow(/Unknown treasury network key/);
    expect(() => loadConfig({
      AIFINPAY_TREASURY_ADDRESSES_JSON: JSON.stringify({ ...treasuries, polygon: "0x1" }),
    })).toThrow(/Invalid local treasury address for polygon/);
    expect(() => loadConfig({ AIFINPAY_TREASURY_ACCOUNTING_INTERVAL_SECONDS: "10" }))
      .toThrow(/must be 60..86400/);
  });
});
