import { sha256 } from "@noble/hashes/sha2.js";
import { decodeBase58, encodeBase58, encodeShortVec } from "./solana-transfer.js";

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");
const P = (1n << 255n) - 19n;
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

export const SOLANA_SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const SOLANA_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

function mod(value: bigint): bigint { const r = value % P; return r >= 0n ? r : r + P; }
function pow(base: bigint, exponent: bigint): bigint {
  let b = mod(base), e = exponent, out = 1n;
  while (e > 0n) { if (e & 1n) out = mod(out * b); b = mod(b * b); e >>= 1n; }
  return out;
}
function inv(value: bigint): bigint { return pow(value, P - 2n); }
function bytesToBigIntLE(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]!);
  return value;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0; for (const p of parts) { out.set(p, offset); offset += p.length; } return out;
}
function keyBytes(value: string): Uint8Array {
  const bytes = decodeBase58(value);
  if (bytes.length !== 32) throw new Error("Expected a 32-byte Solana public key.");
  return bytes;
}

/** True when 32 compressed bytes decompress to an Ed25519 curve point. */
export function isSolanaCurvePoint(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const copy = Uint8Array.from(bytes);
  copy[31] = copy[31]! & 0x7f;
  const y = bytesToBigIntLE(copy);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const v = mod(D * y2 + 1n);
  if (v === 0n) return false;
  const x2 = mod((y2 - 1n) * inv(v));
  let x = pow(x2, (P + 3n) / 8n);
  if (mod(x * x) !== x2) x = mod(x * SQRT_M1);
  return mod(x * x) === x2;
}

export function createSolanaProgramAddress(seeds: Uint8Array[], programId: string): string {
  if (seeds.some((seed) => seed.length > 32)) throw new Error("Solana PDA seed exceeds 32 bytes.");
  const digest = sha256(concat(...seeds, keyBytes(programId), PDA_MARKER));
  if (isSolanaCurvePoint(digest)) throw new Error("Derived address is on the Ed25519 curve.");
  return encodeBase58(digest);
}

export function findSolanaProgramAddress(seeds: Uint8Array[], programId: string): { address: string; bump: number } {
  for (let bump = 255; bump >= 0; bump--) {
    try { return { address: createSolanaProgramAddress([...seeds, Uint8Array.of(bump)], programId), bump }; }
    catch (error) { if (!(error instanceof Error) || !/on the Ed25519 curve/.test(error.message)) throw error; }
  }
  throw new Error("Unable to find a viable Solana PDA bump.");
}

export function solanaAssociatedTokenAddress(owner: string, mint: string): string {
  return findSolanaProgramAddress(
    [keyBytes(owner), keyBytes(SOLANA_TOKEN_PROGRAM), keyBytes(mint)],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM
  ).address;
}

export interface SolanaAccountMeta { pubkey: string; isSigner: boolean; isWritable: boolean }
export interface SolanaInstruction { programId: string; keys: SolanaAccountMeta[]; data: Uint8Array }

/** Compile one or more instructions into a legacy Solana message. */
export function buildSolanaLegacyMessage(
  feePayer: string,
  recentBlockhash: string,
  instructions: SolanaInstruction[]
): Uint8Array {
  if (!instructions.length) throw new Error("At least one Solana instruction is required.");
  const payer = keyBytes(feePayer); void payer;
  keyBytes(recentBlockhash);
  const meta = new Map<string, SolanaAccountMeta>();
  meta.set(feePayer, { pubkey: feePayer, isSigner: true, isWritable: true });
  for (const ix of instructions) {
    keyBytes(ix.programId);
    const existingProgram = meta.get(ix.programId);
    meta.set(ix.programId, { pubkey: ix.programId, isSigner: existingProgram?.isSigner ?? false, isWritable: existingProgram?.isWritable ?? false });
    for (const key of ix.keys) {
      keyBytes(key.pubkey);
      const current = meta.get(key.pubkey);
      meta.set(key.pubkey, {
        pubkey: key.pubkey,
        isSigner: Boolean(current?.isSigner || key.isSigner),
        isWritable: Boolean(current?.isWritable || key.isWritable)
      });
    }
  }
  const values = [...meta.values()];
  const ordered = [
    ...values.filter((m) => m.isSigner && m.isWritable),
    ...values.filter((m) => m.isSigner && !m.isWritable),
    ...values.filter((m) => !m.isSigner && m.isWritable),
    ...values.filter((m) => !m.isSigner && !m.isWritable)
  ];
  if (ordered[0]?.pubkey !== feePayer) throw new Error("Fee payer must be the first signer.");
  if (ordered.length > 256) throw new Error("Legacy Solana message has too many account keys.");
  const index = new Map(ordered.map((m, i) => [m.pubkey, i]));
  const requiredSignatures = ordered.filter((m) => m.isSigner).length;
  const readonlySigned = ordered.filter((m) => m.isSigner && !m.isWritable).length;
  const readonlyUnsigned = ordered.filter((m) => !m.isSigner && !m.isWritable).length;
  const compiled = instructions.map((ix) => {
    const programIndex = index.get(ix.programId);
    if (programIndex === undefined) throw new Error("Solana program key is missing from message.");
    const accountIndices = ix.keys.map((key) => {
      const i = index.get(key.pubkey); if (i === undefined) throw new Error("Solana account key is missing from message."); return i;
    });
    return concat(
      Uint8Array.of(programIndex),
      encodeShortVec(accountIndices.length),
      Uint8Array.from(accountIndices),
      encodeShortVec(ix.data.length),
      ix.data
    );
  });
  return concat(
    Uint8Array.of(requiredSignatures, readonlySigned, readonlyUnsigned),
    encodeShortVec(ordered.length),
    ...ordered.map((m) => keyBytes(m.pubkey)),
    keyBytes(recentBlockhash),
    encodeShortVec(compiled.length),
    ...compiled
  );
}
