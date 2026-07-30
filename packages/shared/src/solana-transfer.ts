const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

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

export function encodeShortVec(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid shortvec value.");
  const bytes: number[] = [];
  let remaining = value;
  do {
    let next = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) next |= 0x80;
    bytes.push(next);
  } while (remaining > 0);
  return Uint8Array.from(bytes);
}

export function decodeBase58(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  let number = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error("Invalid base58 value.");
    number = number * 58n + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number > 0n) {
    bytes.push(Number(number & 0xffn));
    number >>= 8n;
  }
  bytes.reverse();
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === "1") leadingZeroes += 1;
  return Uint8Array.from([...new Array<number>(leadingZeroes).fill(0), ...bytes]);
}

export function encodeBase58(value: Uint8Array): string {
  if (!value.length) return "";
  let number = 0n;
  for (const byte of value) number = (number << 8n) + BigInt(byte);
  let encoded = "";
  while (number > 0n) {
    const remainder = Number(number % 58n);
    encoded = BASE58_ALPHABET[remainder]! + encoded;
    number /= 58n;
  }
  let leadingZeroes = 0;
  while (leadingZeroes < value.length && value[leadingZeroes] === 0) leadingZeroes += 1;
  return "1".repeat(leadingZeroes) + encoded;
}

function publicKey(value: string): Uint8Array {
  const decoded = decodeBase58(value);
  if (decoded.length !== 32) throw new Error("Expected a 32-byte Solana public key.");
  return decoded;
}

/**
 * Build the exact legacy Solana message for one SystemProgram.transfer.
 * Account order is deterministic: fee payer, recipient, system program.
 */
export function buildSolanaTransferMessage(
  sender: string,
  recipient: string,
  lamports: bigint,
  recentBlockhash: string
): Uint8Array {
  if (lamports <= 0n) throw new Error("Transfer amount must be positive.");
  if (sender === recipient) throw new Error("Sender and recipient must differ.");
  const senderKey = publicKey(sender);
  const recipientKey = publicKey(recipient);
  const systemKey = publicKey(SYSTEM_PROGRAM_ID);
  const blockhash = publicKey(recentBlockhash);
  const transferData = concatBytes(u32le(2), u64le(lamports));
  const instruction = concatBytes(
    Uint8Array.of(2),
    encodeShortVec(2),
    Uint8Array.of(0, 1),
    encodeShortVec(transferData.length),
    transferData
  );
  return concatBytes(
    Uint8Array.of(1, 0, 1),
    encodeShortVec(3),
    senderKey,
    recipientKey,
    systemKey,
    blockhash,
    encodeShortVec(1),
    instruction
  );
}

export function serializeSolanaSignedTransaction(message: Uint8Array, signature: Uint8Array): Uint8Array {
  if (signature.length !== 64) throw new Error("Expected a 64-byte Ed25519 signature.");
  return concatBytes(encodeShortVec(1), signature, message);
}

export function parseSolanaSignedTransaction(serialized: Uint8Array): { signature: Uint8Array; message: Uint8Array } {
  if (serialized.length < 66 || serialized[0] !== 1) throw new Error("Expected one Solana signature.");
  return { signature: serialized.slice(1, 65), message: serialized.slice(65) };
}

export function solanaTransactionSignature(serialized: Uint8Array): string {
  return encodeBase58(parseSolanaSignedTransaction(serialized).signature);
}
