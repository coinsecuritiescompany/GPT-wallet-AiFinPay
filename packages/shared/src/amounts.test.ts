import { describe, expect, it } from "vitest";
import { formatBaseUnits, parseBaseUnits } from "./amounts.js";

describe("decimal-safe amounts", () => {
  it("converts USDC without floating point", () => {
    expect(parseBaseUnits("2543.68", 6)).toBe(2_543_680_000n);
    expect(formatBaseUnits(2_543_680_000n, 6)).toBe("2543.68");
  });
  it.each(["1e3", "-1", "1,2", "0", ".5", "01"])("rejects malformed amount %s", (amount) => {
    expect(() => parseBaseUnits(amount, 6)).toThrow();
  });
  it("rejects excess precision", () => expect(() => parseBaseUnits("0.0000001", 6)).toThrow());
});

