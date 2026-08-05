// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { swapFundingRoute } from "./App.js";

// A swap deposit is an ordinary transfer to the provider's address, so it can be
// funded from any chain the Vault signs for. The previous version hardcoded
// network "POLYGON" and refused anything else, so a Casper swap — the headline
// feature — offered no way to pay for itself from the wallet.
const asset = (ticker: string, network: string) => ({ ticker, network, name: ticker.toUpperCase() }) as never;

describe("funding a swap deposit from the wallet", () => {
  it("routes each chain to the transfer tool that accepts its addresses", () => {
    expect(swapFundingRoute(asset("cspr", "cspr"))).toMatchObject({ network: "CASPER", tool: "prepare_casper_transfer", token: "NATIVE" });
    expect(swapFundingRoute(asset("sol", "sol"))).toMatchObject({ network: "SOLANA", tool: "prepare_solana_transfer" });
    expect(swapFundingRoute(asset("near", "near"))).toMatchObject({ network: "NEAR", tool: "prepare_near_transfer" });
    expect(swapFundingRoute(asset("apt", "aptos"))).toMatchObject({ network: "APTOS", tool: "prepare_aptos_transfer" });
    expect(swapFundingRoute(asset("pol", "matic"))).toMatchObject({ network: "POLYGON", tool: "prepare_transfer" });
  });

  it("allows USDC only where the tool can carry a token argument", () => {
    expect(swapFundingRoute(asset("usdc", "matic"))).toMatchObject({ token: "USDC", tool: "prepare_transfer" });
    // Casper has no canonical USDC and its tool takes no token argument.
    expect(swapFundingRoute(asset("usdc", "cspr"))).toBeNull();
    expect(swapFundingRoute(asset("usdc", "sol"))).toBeNull();
  });

  it("refuses to substitute one asset for another, which can lose the deposit", () => {
    expect(swapFundingRoute(asset("wbtc", "matic"))).toBeNull();
    expect(swapFundingRoute(asset("shib", "eth"))).toBeNull();
    expect(swapFundingRoute(asset("cspr", "matic"))).toBeNull();
  });

  it("returns null for a chain the Vault cannot sign for", () => {
    expect(swapFundingRoute(asset("btc", "btc"))).toBeNull();
    expect(swapFundingRoute(asset("xmr", "xmr"))).toBeNull();
  });
});
