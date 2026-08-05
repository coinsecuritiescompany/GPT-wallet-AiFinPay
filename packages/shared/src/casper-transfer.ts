import { blake2b } from "@noble/hashes/blake2.js";

// Casper deploy construction, serialised by hand so the same code can build a
// transfer on the server and re-derive it in the signed-transaction validator.
// Matches the approach already used for NEAR and Solana: no chain SDK, no
// browser-hostile dependencies, just the bytesrepr encoding Casper specifies.
//
// A Casper deploy is signed over its 32-byte hash, which is blake2b256 of the
// serialised header. The header in turn commits to a body hash covering the
// payment and session items, so signing the hash commits to the whole payload.

const ED25519_TAG = 0x01;

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
  const output = new Uint8Array(8);
  new DataView(output.buffer).setBigUint64(0, value, true);
  return output;
}

/** Casper serialises U512 as a length byte followed by that many little-endian bytes. */
function u512(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("A U512 cannot be negative.");
  if (value === 0n) return new Uint8Array([0]);
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0n) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  if (bytes.length > 64) throw new Error("Value does not fit in a U512.");
  return new Uint8Array([bytes.length, ...bytes]);
}

function clString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  return concatBytes(u32le(bytes.length), bytes);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("Expected hexadecimal input.");
  const output = new Uint8Array(clean.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** CLType tags, only the ones a native transfer needs. */
const CL_TYPE = {
  u64: new Uint8Array([5]),
  u512: new Uint8Array([8]),
  optionU64: new Uint8Array([13, 5]),
  publicKey: new Uint8Array([22])
} as const;

interface NamedArg {
  name: string;
  /** The value's own bytesrepr encoding, without the length prefix. */
  value: Uint8Array;
  clType: Uint8Array;
  /** What the node echoes back in the JSON envelope. */
  parsed: unknown;
  clTypeJson: unknown;
}

/** A CLValue is a length-prefixed value followed by its type tag. */
function serializeCLValue(arg: NamedArg): Uint8Array {
  return concatBytes(u32le(arg.value.length), arg.value, arg.clType);
}

function serializeArgs(args: NamedArg[]): Uint8Array {
  return concatBytes(
    u32le(args.length),
    ...args.map((arg) => concatBytes(clString(arg.name), serializeCLValue(arg)))
  );
}

function argsToJson(args: NamedArg[]): unknown[] {
  return args.map((arg) => [
    arg.name,
    { cl_type: arg.clTypeJson, bytes: bytesToHex(arg.value), parsed: arg.parsed }
  ]);
}

function amountArg(motes: bigint): NamedArg {
  return {
    name: "amount",
    value: u512(motes),
    clType: CL_TYPE.u512,
    parsed: motes.toString(),
    clTypeJson: "U512"
  };
}

function targetArg(publicKeyHex: string): NamedArg {
  const bytes = hexToBytes(publicKeyHex);
  if (bytes.length !== 33 || bytes[0] !== ED25519_TAG) {
    throw new Error("Expected a 33-byte ed25519 Casper public key beginning with 01.");
  }
  return {
    name: "target",
    value: bytes,
    clType: CL_TYPE.publicKey,
    parsed: publicKeyHex.toLowerCase(),
    clTypeJson: "PublicKey"
  };
}

function idArg(id: bigint | null): NamedArg {
  return {
    name: "id",
    value: id === null ? new Uint8Array([0]) : concatBytes(new Uint8Array([1]), u64le(id)),
    clType: CL_TYPE.optionU64,
    parsed: id === null ? null : id.toString(),
    clTypeJson: { Option: "U64" }
  };
}

/** ExecutableDeployItem::ModuleBytes, used for the payment with empty bytes. */
function serializePayment(paymentMotes: bigint): { bytes: Uint8Array; json: unknown } {
  const args = [amountArg(paymentMotes)];
  return {
    bytes: concatBytes(new Uint8Array([0]), u32le(0), serializeArgs(args)),
    json: { ModuleBytes: { module_bytes: "", args: argsToJson(args) } }
  };
}

/** ExecutableDeployItem::Transfer — the native CSPR transfer. */
function serializeSession(
  recipientPublicKeyHex: string,
  amountMotes: bigint,
  id: bigint | null
): { bytes: Uint8Array; json: unknown } {
  const args = [amountArg(amountMotes), targetArg(recipientPublicKeyHex), idArg(id)];
  return {
    bytes: concatBytes(new Uint8Array([5]), serializeArgs(args)),
    json: { Transfer: { args: argsToJson(args) } }
  };
}

function blake2b256(input: Uint8Array): Uint8Array {
  return blake2b(input, { dkLen: 32 });
}

/** Casper writes a TTL as a human duration; the node parses these exactly. */
function formatTtl(ttlMs: number): string {
  if (ttlMs % 3_600_000 === 0) return `${ttlMs / 3_600_000}h`;
  if (ttlMs % 60_000 === 0) return `${ttlMs / 60_000}m`;
  if (ttlMs % 1_000 === 0) return `${ttlMs / 1_000}s`;
  return `${ttlMs}ms`;
}

export interface CasperTransferParams {
  senderPublicKeyHex: string;
  recipientPublicKeyHex: string;
  amountMotes: bigint;
  paymentMotes: bigint;
  chainName: string;
  timestampMs: number;
  ttlMs: number;
  /** Optional transfer id. Casper requires the field, but it may be None. */
  id?: bigint | null;
}

export interface UnsignedCasperDeploy {
  deployHashHex: string;
  bodyHashHex: string;
  /** The deploy envelope, complete except for approvals. */
  deployJson: Record<string, unknown>;
}

export function buildCasperTransferDeploy(params: CasperTransferParams): UnsignedCasperDeploy {
  const account = hexToBytes(params.senderPublicKeyHex);
  if (account.length !== 33 || account[0] !== ED25519_TAG) {
    throw new Error("Expected a 33-byte ed25519 Casper public key beginning with 01.");
  }
  if (params.amountMotes <= 0n) throw new Error("The transfer amount must be positive.");
  if (params.paymentMotes <= 0n) throw new Error("The payment amount must be positive.");

  const payment = serializePayment(params.paymentMotes);
  const session = serializeSession(params.recipientPublicKeyHex, params.amountMotes, params.id ?? null);
  const bodyHash = blake2b256(concatBytes(payment.bytes, session.bytes));

  const header = concatBytes(
    account,
    u64le(BigInt(params.timestampMs)),
    u64le(BigInt(params.ttlMs)),
    u64le(1n),            // gas price
    bodyHash,
    u32le(0),             // no dependencies
    clString(params.chainName)
  );
  const deployHash = blake2b256(header);

  return {
    deployHashHex: bytesToHex(deployHash),
    bodyHashHex: bytesToHex(bodyHash),
    deployJson: {
      hash: bytesToHex(deployHash),
      header: {
        account: params.senderPublicKeyHex.toLowerCase(),
        timestamp: new Date(params.timestampMs).toISOString(),
        ttl: formatTtl(params.ttlMs),
        gas_price: 1,
        body_hash: bytesToHex(bodyHash),
        dependencies: [],
        chain_name: params.chainName
      },
      payment: payment.json,
      session: session.json,
      approvals: []
    }
  };
}

/** Attach the vault's signature so the deploy can go to account_put_deploy. */
export function attachCasperApproval(
  deployJson: Record<string, unknown>,
  signerPublicKeyHex: string,
  signatureHex: string
): Record<string, unknown> {
  const signature = hexToBytes(signatureHex);
  if (signature.length !== 64) throw new Error("Expected a 64-byte ed25519 signature.");
  return {
    ...deployJson,
    approvals: [
      {
        signer: signerPublicKeyHex.toLowerCase(),
        // Casper prefixes a signature with its algorithm tag, as it does a key.
        signature: `01${bytesToHex(signature)}`
      }
    ]
  };
}

/** Casper account hash, used for balance queries and display. */
export function casperAccountHash(publicKeyHex: string): string {
  const bytes = hexToBytes(publicKeyHex);
  if (bytes.length !== 33 || bytes[0] !== ED25519_TAG) {
    throw new Error("Expected a 33-byte ed25519 Casper public key beginning with 01.");
  }
  const input = concatBytes(
    new TextEncoder().encode("ed25519"),
    new Uint8Array([0]),
    bytes.slice(1)
  );
  return bytesToHex(blake2b256(input));
}
