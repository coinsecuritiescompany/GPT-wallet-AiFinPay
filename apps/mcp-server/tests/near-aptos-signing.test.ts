import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNearTransferTransaction, encodeBase58, serializeNearSignedTransaction,
  type AptosUnsignedRequest, type PaymentIntent, type UnsignedAptosTransaction,
  type UnsignedNearTransaction
} from "@aifinpay/shared";
import { loadConfig } from "../src/config.js";
import { validateSignedAptosTransaction, validateSignedNearTransaction } from "../src/services/signed-transaction-validator.js";
import { UniversalMainnetAdapter } from "../src/services/universal-mainnet-adapter.js";
import { Store } from "../src/storage/store.js";

function rawEd25519PublicKey(publicKey: KeyObject): Buffer {
  const der = publicKey.export({ format: "der", type: "spki" });
  return Buffer.from(der.subarray(der.length - 32));
}

function nearHash(transaction: Uint8Array): string {
  return encodeBase58(createHash("sha256").update(transaction).digest());
}

function connectedStore(stores: Store[], near: string, aptos: string): Store {
  const store = new Store(":memory:");
  stores.push(store);
  store.createWalletPairing("pair", "user-1", new Date(Date.now() + 60_000).toISOString());
  store.completeWalletPairing("pair", {
    evm: "0x1111111111111111111111111111111111111111",
    solana: "So11111111111111111111111111111111111111112",
    near,
    aptos,
    casper: `01${"b".repeat(64)}`
  });
  return store;
}

describe("native NEAR and Aptos Vault signing", () => {
  const stores: Store[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    stores.splice(0).forEach((store) => store.close());
  });

  it("allows NEAR, APTOS and native CSPR send", () => {
    const config = loadConfig({
      AIFINPAY_DEMO_MODE: "false",
      SESSION_SECRET: "test-session-secret-at-least-thirty-two-chars",
      AIFINPAY_SIGNING_NETWORKS: "POLYGON,SOLANA,NEAR,APTOS,CASPER"
    });
    expect(config.signingNetworks).toEqual(["POLYGON", "SOLANA", "NEAR", "APTOS", "CASPER"]);
  });

  it("builds and validates an exact Borsh NEAR transfer", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyBytes = rawEd25519PublicKey(publicKey);
    const signerId = publicKeyBytes.toString("hex");
    const blockHash = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const transaction = buildNearTransferTransaction(
      signerId,
      signerId,
      43n,
      "receiver.near",
      blockHash,
      1_000_000_000_000_000_000_000n
    );
    const digest = createHash("sha256").update(transaction).digest();
    const signature = sign(null, digest, privateKey);
    const serialized = serializeNearSignedTransaction(transaction, signature);
    const expected: UnsignedNearTransaction = {
      kind: "NEAR",
      transactionBase64: Buffer.from(transaction).toString("base64"),
      transactionHash: nearHash(transaction),
      nonce: "43",
      blockHash,
      feeReserveYocto: "10000000000000000000000"
    };

    expect(() => validateSignedNearTransaction(signerId, Buffer.from(serialized).toString("base64"), expected)).not.toThrow();
    const changed = Buffer.from(serialized);
    changed[20] ^= 1;
    expect(() => validateSignedNearTransaction(signerId, changed.toString("base64"), expected))
      .toThrowError(expect.objectContaining({ code: "SIGNING_FAILED" }));
  });

  it("builds a live-data NEAR transfer with nonce, block hash and fee reserve", async () => {
    const near = "a".repeat(64);
    const aptos = `0x${"c".repeat(64)}`;
    const store = connectedStore(stores, near, aptos);
    const blockHash = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => 200 - index));
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: { request_type?: string } };
      const result = body.params.request_type === "view_access_key"
        ? { nonce: 9, block_hash: blockHash }
        : { amount: "10000000000000000000000000" };
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new UniversalMainnetAdapter(store, { NEAR: ["https://near.example"] });
    const intent = {
      network: "NEAR",
      token: "POL",
      recipient: "receiver.near",
      amountBaseUnits: "1000000000000000000000000"
    } as PaymentIntent;

    const transaction = await adapter.buildTransferTransaction("user-1", intent) as UnsignedNearTransaction;
    expect(transaction).toMatchObject({
      kind: "NEAR",
      nonce: "10",
      blockHash,
      feeReserveYocto: "10000000000000000000000"
    });
    expect(transaction.transactionHash).toBe(nearHash(Buffer.from(transaction.transactionBase64, "base64")));
  });

  it("validates Aptos public-key ownership, exact request and Ed25519 signature", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyBytes = rawEd25519PublicKey(publicKey);
    const authKey = createHash("sha3-256").update(Buffer.concat([publicKeyBytes, Buffer.from([0])])).digest("hex");
    const request: AptosUnsignedRequest = {
      sender: `0x${authKey}`,
      sequence_number: "7",
      max_gas_amount: "2000",
      gas_unit_price: "100",
      expiration_timestamp_secs: "2000000000",
      payload: {
        type: "entry_function_payload",
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: [`0x${"d".repeat(64)}`, "100000000"]
      }
    };
    const message = Buffer.from("APTOS::RawTransaction test vector", "utf8");
    const signature = sign(null, message, privateKey);
    const expected: UnsignedAptosTransaction = {
      kind: "APTOS",
      request,
      signingMessageHex: `0x${message.toString("hex")}`,
      maxFeeOctas: "200000"
    };
    const raw = JSON.stringify({
      request,
      publicKeyHex: `0x${publicKeyBytes.toString("hex")}`,
      signatureHex: `0x${signature.toString("hex")}`
    });

    expect(() => validateSignedAptosTransaction(`0x${authKey}`, raw, expected)).not.toThrow();
    const changed = JSON.stringify({
      request: { ...request, sequence_number: "8" },
      publicKeyHex: `0x${publicKeyBytes.toString("hex")}`,
      signatureHex: `0x${signature.toString("hex")}`
    });
    expect(() => validateSignedAptosTransaction(`0x${authKey}`, changed, expected))
      .toThrowError(expect.objectContaining({ code: "SIGNING_FAILED" }));
  });

  it("uses Aptos fullnode sequence, gas, ledger time and encode_submission", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyBytes = rawEd25519PublicKey(publicKey);
    const authKey = createHash("sha3-256").update(Buffer.concat([publicKeyBytes, Buffer.from([0])])).digest("hex");
    const store = connectedStore(stores, "a".repeat(64), `0x${authKey}`);
    const recipient = `0x${"e".repeat(64)}`;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value.endsWith(`/accounts/0x${authKey}`)) return { ok: true, json: async () => ({ sequence_number: "12" }) } as Response;
      if (value.endsWith("/estimate_gas_price")) return { ok: true, json: async () => ({ gas_estimate: 100 }) } as Response;
      if (value.endsWith("/transactions/encode_submission")) {
        const request = JSON.parse(String(init?.body)) as AptosUnsignedRequest;
        expect(request.payload.arguments).toEqual([recipient, "100000000"]);
        return { ok: true, json: async () => "0x01020304" } as Response;
      }
      if (value.includes("CoinStore")) return { ok: true, json: async () => ({ data: { coin: { value: "1000000000" } } }) } as Response;
      return { ok: true, json: async () => ({ ledger_timestamp: "1900000000000000" }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new UniversalMainnetAdapter(store, { APTOS: ["https://aptos.example/v1"] });
    const intent = {
      network: "APTOS",
      token: "POL",
      recipient,
      amountBaseUnits: "100000000"
    } as PaymentIntent;

    const transaction = await adapter.buildTransferTransaction("user-1", intent) as UnsignedAptosTransaction;
    expect(transaction).toMatchObject({
      kind: "APTOS",
      signingMessageHex: "0x01020304",
      maxFeeOctas: "200000",
      request: {
        sender: `0x${authKey}`,
        sequence_number: "12",
        max_gas_amount: "2000",
        gas_unit_price: "100",
        expiration_timestamp_secs: "1900000600"
      }
    });
  });
});
