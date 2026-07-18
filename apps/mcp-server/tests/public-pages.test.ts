import { describe, expect, it } from "vitest";
import { landingPage, privacyPage, supportPage } from "../src/public-pages.js";

describe("public deployment pages", () => {
  it("publishes the configured MCP endpoint and demo warning", () => {
    const html = landingPage("https://wallet.example.com/mcp");
    expect(html).toContain("https://wallet.example.com/mcp");
    expect(html).toContain("No real funds");
    expect(html).toContain("/preview");
  });

  it("documents data handling without claiming real custody", () => {
    expect(privacyPage()).toContain("Data we do not request");
    expect(privacyPage()).toContain("No real blockchain transaction is submitted");
    expect(supportPage()).toContain("Never post");
  });
});
