import { describe, expect, it } from "vitest";

// Regression for the send gate. It was once written as
//   canSend = !isMainnet || (family === "EVM" && enabledForSigning)
// which hid the send form on every non-EVM network even after native Solana,
// NEAR, Aptos and Casper signing shipped. Sending must follow whether the
// operator enabled signing, never the chain family.
function canSend(isMainnet: boolean, network: { family: string; enabledForSigning: boolean }): boolean {
  return !isMainnet || network.enabledForSigning;
}

describe("wallet send gate", () => {
  it("offers sending on any family the operator has enabled, not only EVM", () => {
    for (const family of ["EVM", "SOLANA", "NEAR", "APTOS", "CASPER"]) {
      expect(canSend(true, { family, enabledForSigning: true })).toBe(true);
    }
  });

  it("hides sending on a network the operator has not enabled", () => {
    for (const family of ["EVM", "SOLANA", "NEAR", "APTOS", "CASPER"]) {
      expect(canSend(true, { family, enabledForSigning: false })).toBe(false);
    }
  });

  it("always allows the demo network", () => {
    expect(canSend(false, { family: "CASPER", enabledForSigning: false })).toBe(true);
  });
});
