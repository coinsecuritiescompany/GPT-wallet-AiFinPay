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
});
