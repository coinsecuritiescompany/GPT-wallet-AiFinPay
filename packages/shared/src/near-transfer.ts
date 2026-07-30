import { decodeBase58, encodeBase58 } from "./solana-transfer.js";

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function u32le(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error("Value does not fit in u32.");
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, true);
  return output;
}

function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Value does not fit in u64.");
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, value, true);
  return output;
}

function u128le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffffffffffffffffffn) throw new Error("Value does not fit in u128.");
  const output = new Uint8Array(16);
  const view = new DataView(output.buffer);
  view.setBigUint64(0, value & 0xffffffffffffffffn, true);
  view.setBigUint64(8, value >> 64n, true);
  return output;
}

function borshString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(u32le(bytes.length), bytes);
}

function hexBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("Expected a 32-byte NEAR Ed25519 public key.");
  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

/**
 * Serialize a legacy NEAR Transaction with one native Transfer action.
 * Borsh enum indexes follow nearcore: Ed25519 key = 0, Transfer action = 3.
 */
export function buildNearTransferTransaction(
  signerId: string,
  publicKeyHex: string,
  nonce: bigint,
  receiverId: string,
  blockHashBase58: string,
  depositYocto: bigint
): Uint8Array {
  if (!/^[a-z0-9._-]{2,64}$/.test(signerId)) throw new Error("Invalid NEAR signer account.");
  if (!/^[a-z0-9._-]{2,64}$/.test(receiverId)) throw new Error("Invalid NEAR receiver account.");
  if (nonce <= 0n) throw new Error("NEAR nonce must be positive.");
  if (depositYocto <= 0n) throw new Error("Transfer amount must be positive.");
  const publicKey = hexBytes(publicKeyHex);
  const blockHash = decodeBase58(blockHashBase58);
  if (blockHash.length !== 32) throw new Error("Expected a 32-byte NEAR block hash.");
  return concatBytes(
    borshString(signerId),
    Uint8Array.of(0),
    publicKey,
    u64le(nonce),
    borshString(receiverId),
    blockHash,
    u32le(1),
    Uint8Array.of(3),
    u128le(depositYocto)
  );
}

export function serializeNearSignedTransaction(transaction: Uint8Array, signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) throw new Error("Expected a 64-byte Ed25519 signature.");
  return concatBytes(transaction, Uint8Array.of(0), signature);
}

export function parseNearSignedTransaction(serialized: Uint8Array, transactionLength: number): { transaction: Uint8Array; signature: Uint8Array } {
  if (transactionLength <= 0 || serialized.length !== transactionLength + 65) throw new Error("Malformed NEAR signed transaction.");
  if (serialized[transactionLength] !== 0) throw new Error("Expected an Ed25519 NEAR signature.");
  return {
    transaction: serialized.slice(0, transactionLength),
    signature: serialized.slice(transactionLength + 1)
  };
}

export function nearRpcPublicKey(publicKeyHex: string): string {
  return `ed25519:${encodeBase58(hexBytes(publicKeyHex))}`;
}
