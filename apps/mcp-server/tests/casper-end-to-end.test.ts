import { afterEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  attachCasperApproval, bytesToHex, hexToBytes, type UnsignedCasperTransaction
} from "@aifinpay/shared";
import { AuditService } from "../src/audit/audit-service.js";
import { ConfirmationService } from "../src/services/confirmation-service.js";
import { PaymentService } from "../src/services/payment-service.js";
import { validateSignedCasperTransaction } from "../src/services/signed-transaction-validator.js";
import { UniversalMainnetAdapter } from "../src/services/universal-mainnet-adapter.js";
import { Store } from "../src/storage/store.js";

// The whole Casper send path, driven the way the wallet drives it.
//
// Six separate defects shipped because each layer was verified alone: the UI
// gate, the missing tool, the form calling the EVM tool, the widget cache key,
// secp256k1 keys, and finally prepare() refusing Casper outright. Every one sat
// between a correct server and the user's finger, and every one would have been
// caught by a test that walked the entire chain once.
//
// This is that test: real PaymentService.prepare, real adapter, real deploy,
// real signature, real validator. Only the chain RPC and the Vault's key
// storage are stood in for.

const SENDER_SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 7);
const SENDER = `01${bytesToHex(ed25519.getPublicKey(SENDER_SEED))}`;
// A secp256k1 recipient — the kind that was rejected outright.
const RECIPIENT_SECP = `02${"3a".repeat(33)}`;
const RECIPIENT_ED = `01${"5c".repeat(32)}`;

function connectedStore(stores: Store[]): Store {
  const store = new Store(":memory:");
  stores.push(store);
  store.createWalletPairing("pair", "user-1", new Date(Date.now() + 60_000).toISOString());
  store.completeWalletPairing("pair", {
    evm: "0x1111111111111111111111111111111111111111",
    solana: "So11111111111111111111111111111111111111112",
    near: "a".repeat(64),
    aptos: `0x${"c".repeat(64)}`,
    casper: SENDER
  });
  return store;
}

/** Casper mainnet with a funded main purse. */
function stubCasperRpc(motes: string) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: { api_version: "2.0.0", balance: motes } })
  }) as unknown as Response));
}

function services(store: Store) {
  const audit = new AuditService(store);
  const confirmations = new ConfirmationService("test-secret-at-least-thirty-two-characters-long");
  const adapter = new UniversalMainnetAdapter(store, { CASPER: ["https://casper.example/rpc"] });
  return { payments: new PaymentService(store, audit, confirmations, adapter), adapter };
}

describe("Casper send — the complete path", () => {
  const stores: Store[] = [];
  afterEach(() => { stores.splice(0).forEach((s) => s.close()); vi.unstubAllGlobals(); });

  for (const [label, recipient] of [["secp256k1", RECIPIENT_SECP], ["ed25519", RECIPIENT_ED]] as const) {
    it(`prepares, builds, signs and validates a CSPR transfer to a ${label} recipient`, async () => {
      const store = connectedStore(stores);
      stubCasperRpc("40000000000"); // 40 CSPR
      const { payments, adapter } = services(store);

      // 1. prepare() — the step that used to throw "not implemented yet"
      const prepared = await payments.prepare("user-1", {
        recipient, amount: "30", token: "POL", network: "CASPER",
        idempotencyKey: `e2e-${label}-${Date.now()}`
      });
      expect(prepared.intent.status).not.toBe("BLOCKED");
      expect(prepared.intent.network).toBe("CASPER");
      expect(prepared.intent.amountBaseUnits).toBe("30000000000"); // 9 decimals

      // 2. the adapter builds a real deploy
      const unsigned = await adapter.buildTransferTransaction("user-1", prepared.intent) as UnsignedCasperTransaction;
      expect(unsigned.kind).toBe("CASPER");
      expect(unsigned.deployHashHex).toMatch(/^[0-9a-f]{64}$/);
      expect(unsigned.senderPublicKeyHex).toBe(SENDER.toLowerCase());
      expect((unsigned.deployJson.header as Record<string, unknown>).chain_name).toBe("casper");

      // 3. the Vault signs the deploy hash
      const signature = ed25519.sign(hexToBytes(unsigned.deployHashHex), SENDER_SEED);
      const signed = JSON.stringify({
        deployJson: unsigned.deployJson,
        signerPublicKeyHex: SENDER.toLowerCase(),
        signatureHex: bytesToHex(signature)
      });

      // 4. the server validator accepts it
      expect(() => validateSignedCasperTransaction(SENDER, signed, unsigned)).not.toThrow();

      // 5. and the approval attaches in the shape the node expects
      const ready = attachCasperApproval(unsigned.deployJson, SENDER, bytesToHex(signature));
      expect((ready.approvals as Array<{ signature: string }>)[0].signature).toMatch(/^01[0-9a-f]{128}$/);
    });
  }

  it("refuses below Casper's 2.5 CSPR network minimum", async () => {
    const store = connectedStore(stores);
    stubCasperRpc("40000000000");
    const { payments, adapter } = services(store);
    const prepared = await payments.prepare("user-1", {
      recipient: RECIPIENT_ED, amount: "1", token: "POL", network: "CASPER", idempotencyKey: `min-${Date.now()}`
    });
    await expect(adapter.buildTransferTransaction("user-1", prepared.intent)).rejects.toThrow(/2\.5 CSPR/);
  });

  it("refuses when the balance cannot cover the amount plus the fee", async () => {
    const store = connectedStore(stores);
    stubCasperRpc("30050000000"); // 30.05 — short of 30 + 0.1
    const { payments, adapter } = services(store);
    const prepared = await payments.prepare("user-1", {
      recipient: RECIPIENT_ED, amount: "30", token: "POL", network: "CASPER", idempotencyKey: `funds-${Date.now()}`
    });
    await expect(adapter.buildTransferTransaction("user-1", prepared.intent)).rejects.toThrow(/Insufficient CSPR/);
  });

  it("rejects a malformed Casper recipient at prepare, not deep in the deploy builder", async () => {
    const store = connectedStore(stores);
    stubCasperRpc("40000000000");
    const { payments } = services(store);
    await expect(payments.prepare("user-1", {
      recipient: "0x1D5eF769A024B3157c76884fbd10302d8d83fAB9",
      amount: "30", token: "POL", network: "CASPER", idempotencyKey: `bad-${Date.now()}`
    })).rejects.toThrow(/Casper public key/);
  });

  it("refuses a stablecoin send, since Casper has no canonical USDC", async () => {
    const store = connectedStore(stores);
    stubCasperRpc("40000000000");
    const { payments } = services(store);
    await expect(payments.prepare("user-1", {
      recipient: RECIPIENT_ED, amount: "30", token: "USDC", network: "CASPER", idempotencyKey: `usdc-${Date.now()}`
    })).rejects.toThrow();
  });
});
