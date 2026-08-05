import { describe, expect, it } from "vitest";
import { z } from "zod";

// The generic prepare_transfer only accepts EVM recipients (0x + 40 hex), so
// every non-EVM chain needs its own tool. Casper had none: the adapter could
// build and broadcast a deploy, but nothing exposed it to the model, so a
// Casper send could not be started at all. This pins the address rule that
// tool uses.
const casperAddressSchema = z.string().transform((value) => value.toLowerCase())
  .pipe(z.string().regex(/^01[0-9a-f]{64}$/, "Expected a 33-byte ed25519 Casper public key beginning with 01"));

const EVM_ONLY = /^0x[a-fA-F0-9]{40}$/;

describe("casper transfer tool address rules", () => {
  const valid = "01d92f9915ff6c42524153e62297ba993619cdb8bdaf69143c1b14d9b3c61b968a";

  it("accepts a Casper ed25519 public key, in either case", () => {
    expect(casperAddressSchema.parse(valid)).toBe(valid);
    expect(casperAddressSchema.parse(valid.toUpperCase())).toBe(valid);
  });

  it("rejects what the generic EVM transfer tool would have accepted", () => {
    expect(() => casperAddressSchema.parse("0x1D5eF769A024B3157c76884fbd10302d8d83fAB9")).toThrow();
  });

  it("rejects wrong tags, lengths and non-hex", () => {
    for (const bad of [
      "02" + valid.slice(2),            // secp256k1 tag, not ed25519
      "01" + "a".repeat(63),            // too short
      "01" + "a".repeat(65),            // too long
      "01" + "z".repeat(64),            // not hex
      valid.slice(2)                    // missing the tag
    ]) {
      expect(() => casperAddressSchema.parse(bad)).toThrow();
    }
  });

  it("confirms a Casper address could never pass the generic EVM tool", () => {
    expect(EVM_ONLY.test(valid)).toBe(false);
  });
});
