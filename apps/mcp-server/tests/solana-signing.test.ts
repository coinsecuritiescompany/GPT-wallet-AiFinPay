import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSolanaTransferMessage, encodeBase58, serializeSolanaSignedTransaction,
  solanaTransactionSignature, type PaymentIntent, type UnsignedSolanaTransaction
} from "@aifinpay/shared";
import { loadConfig } from "../src/config.js";
import { MainnetAdapter } from "../src/services/mainnet-adapter.js";
import { validateSignedSolanaTransaction } from "../src/services/signed-transaction-validator.js";
import { Store } from "../src/storage/store.js";

const recipient = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
const blockhash = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => 255 - index));

function connectedStore(stores: Store[], sender: string): Store {
  const store = new Store(":memory:");
  stores.push(store);
  store.createWalletPairing("pair", "user-1", new Date(Date.now() + 60_000).toISOString());
  store.completeWalletPairing("pair", {
    evm: "0x1111111111111111111111111111111111111111",
    solana: sender,
    near: "a".repeat(64),
    aptos: "0x1",
    casper: `01${"b".repeat(64)}`
  });
  return store;
}

describe("native Solana Vault signing", () => {
  const stores: Store[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    stores.splice(0).forEach((store) => store.close());
  });

  it("accepts every chain family whose deploy codec is implemented, Casper included", () => {
    const config = loadConfig({
      AIFINPAY_DEMO_MODE: "false",
      SESSION_SECRET: "test-session-secret-at-least-thirty-two-chars",
      AIFINPAY_SIGNING_NETWORKS: "POLYGON,SOLANA,NEAR,APTOS,CASPER"
    });
    expect(config.signingNetworks).toEqual(["POLYGON", "SOLANA", "NEAR", "APTOS", "CASPER"]);
  });

  it("builds the deterministic SystemProgram.transfer message", () => {
    const sender = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 33));
    const message = buildSolanaTransferMessage(sender, recipient, 123_456n, blockhash);
    expect(message[0]).toBe(1);
    expect(message[1]).toBe(0);
    expect(message[2]).toBe(1);
    expect(message).toHaveLength(150);
    expect(Buffer.from(message).toString("base64")).toBe(Buffer.from(buildSolanaTransferMessage(sender, recipient, 123_456n, blockhash)).toString("base64"));
  });

  it("verifies an exact Ed25519-signed Solana transaction and rejects changed bytes", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ format: "der", type: "spki" });
    const sender = encodeBase58(new Uint8Array(spki.subarray(spki.length - 32)));
    const message = buildSolanaTransferMessage(sender, recipient, 50_000n, blockhash);
    const signature = sign(null, Buffer.from(message), privateKey);
    const serialized = serializeSolanaSignedTransaction(message, signature);
    const expected: UnsignedSolanaTransaction = {
      kind: "SOLANA",
      messageBase64: Buffer.from(message).toString("base64"),
      recentBlockhash: blockhash,
      lastValidBlockHeight: 100,
      feeLamports: "5000"
    };

    expect(() => validateSignedSolanaTransaction(sender, Buffer.from(serialized).toString("base64"), expected)).not.toThrow();
    const changed = Uint8Array.from(message);
    changed[changed.length - 1] ^= 1;
    const changedSerialized = serializeSolanaSignedTransaction(changed, sign(null, Buffer.from(changed), privateKey));
    expect(() => validateSignedSolanaTransaction(sender, Buffer.from(changedSerialized).toString("base64"), expected))
      .toThrowError(expect.objectContaining({ code: "SIGNING_FAILED" }));
  });

  it("builds a fee-checked native SOL transfer from live RPC values", async () => {
    const sender = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 65));
    const store = connectedStore(stores, sender);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string };
      const result = request.method === "getLatestBlockhash"
        ? { value: { blockhash, lastValidBlockHeight: 999 } }
        : request.method === "getFeeForMessage"
          ? { value: 5000 }
          : request.method === "getBalance"
            ? { value: 1_000_000 }
            : undefined;
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store, { SOLANA: ["https://solana.example"] });
    const intent = {
      network: "SOLANA",
      token: "POL",
      recipient,
      amountBaseUnits: "100000"
    } as PaymentIntent;

    const transaction = await adapter.buildTransferTransaction("user-1", intent);
    expect(transaction).toMatchObject({
      kind: "SOLANA",
      recentBlockhash: blockhash,
      lastValidBlockHeight: 999,
      feeLamports: "5000"
    });
    expect(Buffer.from((transaction as UnsignedSolanaTransaction).messageBase64, "base64").length).toBe(150);
  });

  it("broadcasts base64 wire bytes and checks the RPC signature", async () => {
    const sender = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 65));
    const store = connectedStore(stores, sender);
    const message = buildSolanaTransferMessage(sender, recipient, 1n, blockhash);
    const serialized = serializeSolanaSignedTransaction(message, Uint8Array.from({ length: 64 }, () => 7));
    const raw = Buffer.from(serialized).toString("base64");
    const expectedSignature = solanaTransactionSignature(serialized);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      expect(request.method).toBe("sendTransaction");
      expect(request.params[0]).toBe(raw);
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: expectedSignature }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new MainnetAdapter(store, { SOLANA: ["https://solana.example"] });
    const result = await adapter.broadcastRawTransaction("SOLANA", raw);
    expect(result).toMatchObject({
      status: "PENDING",
      transactionHash: expectedSignature,
      explorerUrl: `https://solscan.io/tx/${expectedSignature}`
    });
  });
});
