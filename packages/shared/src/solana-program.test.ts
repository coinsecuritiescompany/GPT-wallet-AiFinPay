import { describe, expect, it } from "vitest";
import {
  buildSolanaLegacyMessage, buildSolanaTransferMessage, decodeBase58, encodeBase58,
  findSolanaProgramAddress, isSolanaCurvePoint, solanaAssociatedTokenAddress,
  SOLANA_SYSTEM_PROGRAM
} from "./index.js";

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out;
}
function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8); new DataView(out.buffer).setBigUint64(0, value, true); return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; } return out;
}

const sender = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const recipient = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => 200 - i));
const blockhash = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => 99 + i));

describe("Solana dependency-free program helpers", () => {
  it("generic legacy compiler is byte-identical to the established transfer encoder", () => {
    const amount = 123_456_789n;
    const legacy = buildSolanaTransferMessage(sender, recipient, amount, blockhash);
    const generic = buildSolanaLegacyMessage(sender, blockhash, [{
      programId: SOLANA_SYSTEM_PROGRAM,
      keys: [
        { pubkey: sender, isSigner: true, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: true }
      ],
      data: concat(u32le(2), u64le(amount))
    }]);
    expect(generic).toEqual(legacy);
  });

  it("finds deterministic off-curve PDAs", () => {
    const program = recipient;
    const first = findSolanaProgramAddress([new TextEncoder().encode("aifinpay-settlement-config-v1")], program);
    const second = findSolanaProgramAddress([new TextEncoder().encode("aifinpay-settlement-config-v1")], program);
    expect(second).toEqual(first);
    const bytes = decodeBase58(first.address);
    expect(bytes).toHaveLength(32);
    expect(isSolanaCurvePoint(bytes)).toBe(false);
    expect(first.bump).toBeGreaterThanOrEqual(0);
    expect(first.bump).toBeLessThanOrEqual(255);
  });

  it("derives a deterministic associated token address that is also off-curve", () => {
    const mint = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => 33 + i));
    const ata = solanaAssociatedTokenAddress(sender, mint);
    expect(decodeBase58(ata)).toHaveLength(32);
    expect(isSolanaCurvePoint(decodeBase58(ata))).toBe(false);
    expect(solanaAssociatedTokenAddress(sender, mint)).toBe(ata);
  });
});
