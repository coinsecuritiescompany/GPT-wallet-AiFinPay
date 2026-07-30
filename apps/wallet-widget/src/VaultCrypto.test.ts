// @vitest-environment node
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  buildNearTransferTransaction, encodeBase58, parseNearSignedTransaction,
  type AptosUnsignedRequest, type UnsignedAptosTransaction, type UnsignedNearTransaction
} from "@aifinpay/shared";
import { decryptVault, deriveAddresses, encryptVault, parseEncryptedVault, signAptosTransaction, signNearTransaction } from "./vault-crypto.js";

// Public BIP-39 test vector. It must never receive real funds.
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const secondMnemonic = "legal winner thank year wave sausage worth useful legal winner thank yellow";

describe("local Vault cryptography", () => {
  it("encrypts recovery material and decrypts it only with the password", async () => {
    const vault = await encryptVault(mnemonic, "correct horse battery staple");
    const serialized = JSON.stringify(vault);
    expect(serialized).not.toContain(mnemonic);
    expect(serialized).not.toContain("correct horse battery staple");
    expect(vault.cipher).toBe("AES-GCM");
    expect(vault.kdf).toBe("PBKDF2-SHA256");
    expect(vault.iterations).toBeGreaterThanOrEqual(310_000);
    await expect(decryptVault(vault, "wrong password")).rejects.toThrow();
    await expect(decryptVault(vault, "correct horse battery staple")).resolves.toBe(mnemonic);
  });

  it("treats visually equivalent Unicode passwords consistently across mobile keyboards", async () => {
    const composed = "sécuré-wallet-2026";
    const decomposed = "se\u0301cure\u0301-wallet-2026";
    expect(composed).not.toBe(decomposed);
    const vault = await encryptVault(mnemonic, decomposed);
    await expect(decryptVault(vault, composed)).resolves.toBe(mnemonic);
    await expect(decryptVault(vault, decomposed)).resolves.toBe(mnemonic);
  });

  it("uses fresh salt and IV while deriving stable public addresses", async () => {
    const first = await encryptVault(mnemonic, "correct horse battery staple");
    const second = await encryptVault(mnemonic, "correct horse battery staple");
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.addresses).toEqual(second.addresses);
    expect(first.addresses).toEqual(deriveAddresses(mnemonic));
    expect(first.addresses.evm).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(first.addresses.solana).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(first.addresses.near).toMatch(/^[a-f0-9]{64}$/);
    expect(first.addresses.aptos).toMatch(/^0x[a-f0-9]{64}$/);
    expect(first.addresses.casper).toMatch(/^01[a-f0-9]{64}$/);
  });

  it("creates a different complete address set for a different recovery phrase", () => {
    const first = deriveAddresses(mnemonic);
    const second = deriveAddresses(secondMnemonic);
    expect(second.evm).not.toBe(first.evm);
    expect(second.solana).not.toBe(first.solana);
    expect(second.near).not.toBe(first.near);
    expect(second.aptos).not.toBe(first.aptos);
    expect(second.casper).not.toBe(first.casper);
  });

  it("strictly validates an encrypted Vault before attempting decryption", async () => {
    const vault = await encryptVault(mnemonic, "correct horse battery staple");
    expect(parseEncryptedVault(JSON.parse(JSON.stringify(vault)))).toEqual(vault);
    expect(parseEncryptedVault({ ...vault, iterations: 1 })).toBeNull();
    expect(parseEncryptedVault({ ...vault, iv: "not-base64" })).toBeNull();
    expect(parseEncryptedVault({ ...vault, addresses: { ...vault.addresses, casper: "" } })).toBeNull();
  });

  it("rejects a syntactically valid public address that does not belong to the encrypted recovery phrase", async () => {
    const vault = await encryptVault(mnemonic, "correct horse battery staple");
    const modified = { ...vault, addresses: { ...vault.addresses, evm: `0x${"22".repeat(20)}` } };
    expect(parseEncryptedVault(modified)).not.toBeNull();
    await expect(decryptVault(modified, "correct horse battery staple")).rejects.toThrow(/modified or damaged/);
  });

  it("signs the exact NEAR transaction hash with the derived NEAR key", () => {
    const addresses = deriveAddresses(mnemonic);
    const blockHash = encodeBase58(Uint8Array.from({ length: 32 }, (_, index) => index + 1));
    const transaction = buildNearTransferTransaction(addresses.near, addresses.near, 2n, "receiver.near", blockHash, 1000n);
    const unsigned: UnsignedNearTransaction = {
      kind: "NEAR",
      transactionBase64: Buffer.from(transaction).toString("base64"),
      transactionHash: encodeBase58(sha256(transaction)),
      nonce: "2",
      blockHash,
      feeReserveYocto: "10000000000000000000000"
    };
    const serialized = Buffer.from(signNearTransaction(mnemonic, unsigned), "base64");
    const parsed = parseNearSignedTransaction(serialized, transaction.length);
    expect(Buffer.from(parsed.transaction)).toEqual(Buffer.from(transaction));
    expect(ed25519.verify(parsed.signature, sha256(transaction), Buffer.from(addresses.near, "hex"))).toBe(true);
  });

  it("signs Aptos canonical bytes and returns a public key matching the Vault auth key", () => {
    const addresses = deriveAddresses(mnemonic);
    const request: AptosUnsignedRequest = {
      sender: addresses.aptos,
      sequence_number: "1",
      max_gas_amount: "2000",
      gas_unit_price: "100",
      expiration_timestamp_secs: "2000000000",
      payload: {
        type: "entry_function_payload",
        function: "0x1::aptos_account::transfer",
        type_arguments: [],
        arguments: [`0x${"e".repeat(64)}`, "1000"]
      }
    };
    const message = Buffer.from("aptos canonical signing bytes");
    const unsigned: UnsignedAptosTransaction = {
      kind: "APTOS",
      request,
      signingMessageHex: `0x${message.toString("hex")}`,
      maxFeeOctas: "200000"
    };
    const signed = JSON.parse(signAptosTransaction(mnemonic, unsigned)) as { request: AptosUnsignedRequest; publicKeyHex: string; signatureHex: string };
    expect(signed.request).toEqual(request);
    const publicKey = Buffer.from(signed.publicKeyHex.slice(2), "hex");
    const authKey = createHash("sha3-256").update(Buffer.concat([publicKey, Buffer.from([0])])).digest("hex");
    expect(`0x${authKey}`).toBe(addresses.aptos);
    expect(ed25519.verify(Buffer.from(signed.signatureHex.slice(2), "hex"), message, publicKey)).toBe(true);
  });
});
