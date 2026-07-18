import { describe, expect, it } from "vitest";
import { landingPage, privacyPage, supportPage, termsPage } from "../src/public-pages.js";

describe("public deployment pages", () => {
  it("publishes the configured MCP endpoint and mainnet safety boundary", () => {
    const html = landingPage("https://wallet.example.com/mcp");
    expect(html).toContain("https://wallet.example.com/mcp");
    expect(html).toContain("Live mainnet data");
    expect(html).toContain("/preview");
    expect(html).toContain('src="/icon.png"');
  });

  it("documents data handling without claiming real custody", () => {
    expect(privacyPage()).toContain("Data we do not request");
    expect(privacyPage()).toContain("separate Vault page");
    expect(privacyPage()).toContain("does not submit mainnet transactions");
    expect(supportPage()).toContain("Never post");
    expect(termsPage()).toContain("Mainnet signing and broadcasting are disabled");
  });
});
