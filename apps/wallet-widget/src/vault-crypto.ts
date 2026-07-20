import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { sha512 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { privateKeyToAccount } from "viem/accounts";
import type { UnsignedEvmTransaction } from "@aifinpay/shared";

export interface VaultAddresses { evm: string; solana: string; near: string; aptos: string; casper: string }
export interface EncryptedVault { version: 1; cipher: "AES-GCM"; kdf: "PBKDF2-SHA256"; iterations: number; salt: string; iv: string; ciphertext: string; addresses: VaultAddresses; createdAt: string }

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

function slip10(seed: Uint8Array, path: number[]): Uint8Array {
  let digest = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  let key = digest.slice(0, 32);
  let chainCode = digest.slice(32);
  for (const part of path) {
    const index = part + 0x80000000;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index, false);
    digest = hmac(sha512, chainCode, data);
    key = digest.slice(0, 32);
    chainCode = digest.slice(32);
  }
  return key;
}

export function deriveAddresses(mnemonic: string): VaultAddresses {
  const seed = mnemonicToSeedSync(mnemonic);
  const evmNode = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!evmNode.privateKey) throw new Error("Could not derive the EVM account.");
  const evm = privateKeyToAccount(`0x${bytesToHex(evmNode.privateKey)}`).address;
  const solanaPublic = ed25519.getPublicKey(slip10(seed, [44, 501, 0, 0]));
  const nearPublic = ed25519.getPublicKey(slip10(seed, [44, 397, 0]));
  const aptosPublic = ed25519.getPublicKey(slip10(seed, [44, 637, 0, 0, 0]));
  const aptosAuthKey = sha3_256(new Uint8Array([...aptosPublic, 0]));
  // Casper (SLIP-44 coin type 506). Account public key = ed25519 algorithm tag
  // "01" prefixed to the raw public key hex — the identifier used to receive
  // CSPR and to look up the account's main purse balance.
  const casperPublic = ed25519.getPublicKey(slip10(seed, [44, 506, 0, 0, 0]));
  return { evm, solana: bs58.encode(solanaPublic), near: bytesToHex(nearPublic), aptos: `0x${bytesToHex(aptosAuthKey)}`, casper: `01${bytesToHex(casperPublic)}` };
}

/**
 * Sign an EIP-1559 transaction locally with the vault's EVM key. The mnemonic is
 * decrypted only in memory for this call; the returned value is the serialized
 * signed transaction (0x hex) that the server broadcasts. The private key never
 * leaves this function.
 */
export async function signEvmTransaction(mnemonic: string, unsigned: UnsignedEvmTransaction): Promise<string> {
  const seed = mnemonicToSeedSync(mnemonic);
  const evmNode = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!evmNode.privateKey) throw new Error("Could not derive the EVM account.");
  const account = privateKeyToAccount(`0x${bytesToHex(evmNode.privateKey)}`);
  return account.signTransaction({
    to: unsigned.to as `0x${string}`,
    value: BigInt(unsigned.value),
    data: unsigned.data as `0x${string}`,
    nonce: unsigned.nonce,
    gas: BigInt(unsigned.gas),
    maxFeePerGas: BigInt(unsigned.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(unsigned.maxPriorityFeePerGas),
    chainId: unsigned.chainId,
    type: "eip1559"
  });
}

export async function encryptVault(mnemonic: string, password: string): Promise<EncryptedVault> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 310_000;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify({ mnemonic, createdAt: new Date().toISOString() }));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return { version: 1, cipher: "AES-GCM", kdf: "PBKDF2-SHA256", iterations, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext), addresses: deriveAddresses(mnemonic), createdAt: new Date().toISOString() };
}

export async function decryptVault(vault: EncryptedVault, password: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(vault.salt), iterations: vault.iterations }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(vault.iv) }, key, base64ToBytes(vault.ciphertext));
  return (JSON.parse(new TextDecoder().decode(decrypted)) as { mnemonic: string }).mnemonic;
}
