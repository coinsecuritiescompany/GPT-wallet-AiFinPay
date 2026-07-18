// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptVault, deriveAddresses, encryptVault } from "./vault-crypto.js";

// Public BIP-39 test vector. It must never receive real funds.
const mnemonic = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

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
  });
});
