import { describe, expect, it } from "vitest";
import { buildNearFunctionCallTransaction, decodeBase58, encodeBase58 } from "./index.js";

const publicKeyHex = "11".repeat(32);
const blockHash = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}

describe("NEAR FunctionCall transaction", () => {
  it("encodes the canonical pay call as one FunctionCall action", () => {
    const args = new TextEncoder().encode(JSON.stringify({ merchant: "merchant.near", payment_id: "aifp:abc", valid_until_ms: 1234567890 }));
    const tx = buildNearFunctionCallTransaction(
      publicKeyHex, publicKeyHex, 7n, "settlement.near", blockHash,
      "pay", args, 50_000_000_000_000n, 10_000n
    );
    let o = 0;
    const signerLen = readU32(tx, o); o += 4 + signerLen;
    expect(tx[o++]).toBe(0); // Ed25519 public key
    o += 32;
    expect(readU64(tx, o)).toBe(7n); o += 8;
    const receiverLen = readU32(tx, o); o += 4 + receiverLen;
    expect(decodeBase58(blockHash)).toHaveLength(32); o += 32;
    expect(readU32(tx, o)).toBe(1); o += 4;
    expect(tx[o++]).toBe(2); // Action::FunctionCall
    const methodLen = readU32(tx, o); o += 4;
    expect(new TextDecoder().decode(tx.slice(o, o + methodLen))).toBe("pay"); o += methodLen;
    const argsLen = readU32(tx, o); o += 4;
    expect(tx.slice(o, o + argsLen)).toEqual(args); o += argsLen;
    expect(readU64(tx, o)).toBe(50_000_000_000_000n); o += 8;
    const depositLow = readU64(tx, o);
    expect(depositLow).toBe(10_000n);
  });

  it("rejects unbounded method names and zero gas", () => {
    expect(() => buildNearFunctionCallTransaction(publicKeyHex, publicKeyHex, 1n, "x.near", blockHash, "bad-name!", new Uint8Array(), 1n, 0n)).toThrow();
    expect(() => buildNearFunctionCallTransaction(publicKeyHex, publicKeyHex, 1n, "x.near", blockHash, "pay", new Uint8Array(), 0n, 0n)).toThrow();
  });
});
