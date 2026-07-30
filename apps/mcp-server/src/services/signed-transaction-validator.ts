import { createPublicKey, verify as verifySignature } from "node:crypto";
import {
  AppError, decodeBase58, parseSolanaSignedTransaction,
  type UnsignedEvmTransaction, type UnsignedSolanaTransaction
} from "@aifinpay/shared";
import { parseTransaction, recoverTransactionAddress } from "viem";

/**
 * Treat the reviewed unsigned transaction as authoritative. The Vault may only
 * submit the EIP-1559 transaction the user saw, signed by the connected EVM
 * address; any changed recipient, amount, calldata, nonce, gas or fee is rejected.
 */
export async function validateSignedEvmTransaction(
  connectedAddress: string,
  rawTransaction: string,
  expected: UnsignedEvmTransaction
): Promise<void> {
  if (!/^0x02[0-9a-fA-F]+$/.test(rawTransaction)) {
    throw new AppError("SIGNING_FAILED", "Only the reviewed EIP-1559 transaction format is accepted.");
  }

  try {
    const serialized = rawTransaction as `0x02${string}`;
    const parsed = parseTransaction(serialized);
    const signer = await recoverTransactionAddress({ serializedTransaction: serialized });
    const matches = Boolean(
      signer.toLowerCase() === connectedAddress.toLowerCase()
      && parsed.type === "eip1559"
      && parsed.chainId === expected.chainId
      && parsed.to?.toLowerCase() === expected.to.toLowerCase()
      && parsed.value === BigInt(expected.value)
      && (parsed.data ?? "0x").toLowerCase() === expected.data.toLowerCase()
      && parsed.nonce === expected.nonce
      && parsed.gas === BigInt(expected.gas)
      && parsed.maxFeePerGas === BigInt(expected.maxFeePerGas)
      && parsed.maxPriorityFeePerGas === BigInt(expected.maxPriorityFeePerGas)
    );
    if (!matches) throw new AppError("SIGNING_FAILED", "The signed transaction does not match the payment you reviewed.");
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SIGNING_FAILED", "The signed transaction is invalid or cannot be verified.");
  }
}

/**
 * Validate one native Solana transfer. The message bytes must be byte-for-byte
 * identical to the server-built request and the Ed25519 signature must belong
 * to the connected Vault's Solana public key.
 */
export function validateSignedSolanaTransaction(
  connectedAddress: string,
  rawTransactionBase64: string,
  expected: UnsignedSolanaTransaction
): void {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(rawTransactionBase64)) throw new Error("Malformed base64.");
    const serialized = Buffer.from(rawTransactionBase64, "base64");
    const { signature, message } = parseSolanaSignedTransaction(serialized);
    const expectedMessage = Buffer.from(expected.messageBase64, "base64");
    if (!Buffer.from(message).equals(expectedMessage)) {
      throw new AppError("SIGNING_FAILED", "The signed Solana transaction does not match the payment you reviewed.");
    }
    const publicKeyBytes = decodeBase58(connectedAddress);
    if (publicKeyBytes.length !== 32) throw new Error("Invalid Solana public key.");
    // RFC 8410 SubjectPublicKeyInfo prefix for an Ed25519 raw public key.
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyBytes)]),
      format: "der",
      type: "spki"
    });
    if (!verifySignature(null, Buffer.from(message), key, Buffer.from(signature))) {
      throw new AppError("SIGNING_FAILED", "The Solana transaction was not signed by the connected wallet.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SIGNING_FAILED", "The signed Solana transaction is invalid or cannot be verified.");
  }
}
