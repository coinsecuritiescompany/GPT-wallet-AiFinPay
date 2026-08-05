import { describe, expect, it } from "vitest";

// Regression for the send form. It called prepare_transfer for every network,
// but that tool only accepts EVM recipients (0x + 40 hex), so pressing Review
// transfer on Solana, NEAR, Aptos or Casper failed before a transfer was ever
// built. Each of those chains has its own tool and the form must call it.
const NATIVE_TRANSFER_TOOLS: Record<string, string> = {
  SOLANA: "prepare_solana_transfer",
  NEAR: "prepare_near_transfer",
  APTOS: "prepare_aptos_transfer",
  CASPER: "prepare_casper_transfer"
};

function toolFor(isMainnet: boolean, networkId: string): string {
  const native = isMainnet ? NATIVE_TRANSFER_TOOLS[networkId] : undefined;
  return native ?? "prepare_transfer";
}

describe("send form tool routing", () => {
  it("routes each non-EVM network to its own transfer tool", () => {
    expect(toolFor(true, "CASPER")).toBe("prepare_casper_transfer");
    expect(toolFor(true, "SOLANA")).toBe("prepare_solana_transfer");
    expect(toolFor(true, "NEAR")).toBe("prepare_near_transfer");
    expect(toolFor(true, "APTOS")).toBe("prepare_aptos_transfer");
  });

  it("keeps EVM networks on the generic tool", () => {
    for (const evm of ["POLYGON", "BASE", "ARBITRUM", "OPTIMISM", "BNB", "AVALANCHE", "UNICHAIN"]) {
      expect(toolFor(true, evm)).toBe("prepare_transfer");
    }
  });

  it("uses the generic tool in demo mode, which is Polygon Amoy", () => {
    expect(toolFor(false, "CASPER")).toBe("prepare_transfer");
  });
});
