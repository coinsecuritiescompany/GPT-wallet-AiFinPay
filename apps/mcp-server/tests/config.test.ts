import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const SESSION_SECRET = "test-session-secret-with-at-least-32-characters";
const mainnetEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  SESSION_SECRET,
  AIFINPAY_DEMO_MODE: "false",
  AIFINPAY_WALLET_MODE: "mainnet",
  ...extra
});

describe("deployment config", () => {
  it("derives public URLs from Render without manual interpolation", () => {
    const config = loadConfig(mainnetEnv({ PORT: "10000", RENDER_EXTERNAL_HOSTNAME: "aifinpay-wallet.onrender.com" }));
    expect(config.publicUrl).toBe("https://aifinpay-wallet.onrender.com/mcp");
    expect(config.widgetDomain).toBe("https://aifinpay-wallet.onrender.com");
  });

  it("keeps explicit public URLs authoritative", () => {
    const config = loadConfig(mainnetEnv({
      MCP_PUBLIC_URL: "https://wallet.aifinpay.io/mcp",
      WIDGET_PUBLIC_URL: "https://wallet.aifinpay.io",
      RENDER_EXTERNAL_URL: "https://ignored.onrender.com"
    }));
    expect(config.publicUrl).toBe("https://wallet.aifinpay.io/mcp");
    expect(config.widgetDomain).toBe("https://wallet.aifinpay.io");
  });

  it("enables Polygon mainnet mode explicitly", () => {
    const config = loadConfig(mainnetEnv({ POLYGON_RPC_URLS: "https://one.example, https://two.example" }));
    expect(config.walletMode).toBe("mainnet");
    expect(config.demoMode).toBe(false);
    expect(config.polygonRpcUrls).toEqual(["https://one.example", "https://two.example"]);
  });

  it("never enables demo authentication by omission", () => {
    const config = loadConfig({ SESSION_SECRET });
    expect(config.walletMode).toBe("mainnet");
    expect(config.demoMode).toBe(false);
  });

  it("requires a strong session secret outside explicit demo mode", () => {
    expect(() => loadConfig({})).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ SESSION_SECRET: "too-short" })).toThrow(/SESSION_SECRET/);
  });

  it("forbids demo authentication with mainnet wallet mode", () => {
    expect(() => loadConfig({
      AIFINPAY_DEMO_MODE: "true",
      AIFINPAY_WALLET_MODE: "mainnet",
      SESSION_SECRET
    })).toThrow(/forbidden/);
  });

  it("allows demo auth only with explicit demo wallet mode", () => {
    const config = loadConfig({
      AIFINPAY_DEMO_MODE: "true",
      AIFINPAY_WALLET_MODE: "demo"
    });
    expect(config.demoMode).toBe(true);
    expect(config.walletMode).toBe("demo");
  });

  it("keeps the swap provider key server-side and optional", () => {
    expect(loadConfig(mainnetEnv()).changeNowApiKey).toBeUndefined();
    expect(loadConfig(mainnetEnv({ CHANGENOW_API_KEY: "partner-secret" })).changeNowApiKey).toBe("partner-secret");
  });

  it("requires at least 32 characters for analytics dashboard bearer token", () => {
    expect(loadConfig(mainnetEnv({ ANALYTICS_DASHBOARD_TOKEN: "short-token" })).analyticsDashboardToken).toBeUndefined();
    expect(loadConfig(mainnetEnv({ ANALYTICS_DASHBOARD_TOKEN: "x".repeat(32) })).analyticsDashboardToken).toBe("x".repeat(32));
  });
});
