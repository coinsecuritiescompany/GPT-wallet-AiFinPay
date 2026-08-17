import { blake2b } from "@noble/hashes/blake2.js";
import { parseCasperPublicKey, bytesToHex, hexToBytes } from "./casper-transfer.js";

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}
function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out;
}
function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Value does not fit in u64.");
  const out = new Uint8Array(8); new DataView(out.buffer).setBigUint64(0, value, true); return out;
}
function u512(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("A U512 cannot be negative.");
  if (value === 0n) return Uint8Array.of(0);
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0n) { bytes.push(Number(remaining & 0xffn)); remaining >>= 8n; }
  if (bytes.length > 64) throw new Error("Value does not fit in U512.");
  return Uint8Array.of(bytes.length, ...bytes);
}
function clString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value); return concatBytes(u32le(bytes.length), bytes);
}
function clValue(value: Uint8Array, clType: Uint8Array): Uint8Array {
  return concatBytes(u32le(value.length), value, clType);
}
function arg(name: string, value: Uint8Array, clType: Uint8Array, parsed: unknown, clTypeJson: unknown) {
  return { name, value, clType, parsed, clTypeJson };
}
function argsBytes(args: ReturnType<typeof arg>[]): Uint8Array {
  return concatBytes(u32le(args.length), ...args.map((a) => concatBytes(clString(a.name), clValue(a.value, a.clType))));
}
function argsJson(args: ReturnType<typeof arg>[]): unknown[] {
  return args.map((a) => [a.name, { cl_type: a.clTypeJson, bytes: bytesToHex(a.value), parsed: a.parsed }]);
}
function standardPayment(paymentMotes: bigint): { bytes: Uint8Array; json: unknown } {
  const amount = arg("amount", u512(paymentMotes), Uint8Array.of(8), paymentMotes.toString(), "U512");
  return {
    bytes: concatBytes(Uint8Array.of(0), u32le(0), argsBytes([amount])),
    json: { ModuleBytes: { module_bytes: "", args: argsJson([amount]) } }
  };
}
function formattedTtl(ttlMs: number): string {
  if (ttlMs % 3_600_000 === 0) return `${ttlMs / 3_600_000}h`;
  if (ttlMs % 60_000 === 0) return `${ttlMs / 60_000}m`;
  if (ttlMs % 1_000 === 0) return `${ttlMs / 1_000}s`;
  return `${ttlMs}ms`;
}
function blake(input: Uint8Array): Uint8Array { return blake2b(input, { dkLen: 32 }); }

export interface CasperSettlementDeployParams {
  senderPublicKeyHex: string;
  contractHash: string;
  route: 1 | 2;
  merchantAccountHash: string;
  grossAmountMotes: bigint;
  requestId: string;
  validUntilMs: bigint;
  paymentMotes: bigint;
  chainName: string;
  timestampMs: number;
  ttlMs: number;
}

/**
 * Build a Casper Deploy whose session is ExecutableDeployItem::StoredContractByHash.
 * Wire layout follows casper-js-sdk ExecutableDeployItemType=1:
 *   0x01 | contract_hash[32] | entry_point:String | RuntimeArgs.
 */
export function buildCasperSettlementDeploy(params: CasperSettlementDeployParams) {
  const sender = parseCasperPublicKey(params.senderPublicKeyHex);
  if (sender[0] !== 1 || sender.length !== 33) throw new Error("Settlement sender must be an ed25519 Casper public key.");
  const contract = hexToBytes(params.contractHash.replace(/^contract-/, ""));
  if (contract.length !== 32) throw new Error("Expected a 32-byte Casper contract hash.");
  if (params.route !== 1 && params.route !== 2) throw new Error("Settlement route must be 1 or 2.");
  if (!/^account-hash-[0-9a-f]{64}$/i.test(params.merchantAccountHash)) throw new Error("Invalid Casper merchant account hash.");
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(params.requestId)) throw new Error("Invalid Casper request id.");
  if (params.grossAmountMotes <= 0n || params.paymentMotes <= 0n) throw new Error("Amounts must be positive.");
  if (params.validUntilMs <= BigInt(params.timestampMs)) throw new Error("Settlement expiry must be in the future.");

  const runtimeArgs = [
    arg("route", Uint8Array.of(params.route), Uint8Array.of(3), params.route, "U8"),
    arg("merchant", clString(params.merchantAccountHash.toLowerCase()), Uint8Array.of(10), params.merchantAccountHash.toLowerCase(), "String"),
    arg("gross_amount", u512(params.grossAmountMotes), Uint8Array.of(8), params.grossAmountMotes.toString(), "U512"),
    arg("request_id", clString(params.requestId), Uint8Array.of(10), params.requestId, "String"),
    arg("valid_until_ms", u64le(params.validUntilMs), Uint8Array.of(5), params.validUntilMs.toString(), "U64")
  ];
  const sessionBytes = concatBytes(Uint8Array.of(1), contract, clString("pay"), argsBytes(runtimeArgs));
  const sessionJson = {
    StoredContractByHash: {
      hash: bytesToHex(contract),
      entry_point: "pay",
      args: argsJson(runtimeArgs)
    }
  };
  const payment = standardPayment(params.paymentMotes);
  const bodyHash = blake(concatBytes(payment.bytes, sessionBytes));
  const header = concatBytes(
    sender,
    u64le(BigInt(params.timestampMs)),
    u64le(BigInt(params.ttlMs)),
    u64le(1n),
    bodyHash,
    u32le(0),
    clString(params.chainName)
  );
  const deployHash = blake(header);
  return {
    deployHashHex: bytesToHex(deployHash),
    bodyHashHex: bytesToHex(bodyHash),
    deployJson: {
      hash: bytesToHex(deployHash),
      header: {
        account: params.senderPublicKeyHex.toLowerCase(),
        timestamp: new Date(params.timestampMs).toISOString(),
        ttl: formattedTtl(params.ttlMs),
        gas_price: 1,
        body_hash: bytesToHex(bodyHash),
        dependencies: [],
        chain_name: params.chainName
      },
      payment: payment.json,
      session: sessionJson,
      approvals: []
    }
  };
}
