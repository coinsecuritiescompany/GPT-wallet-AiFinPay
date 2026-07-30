import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import {
  AppError, decodeBase58, encodeBase58, parseNearSignedTransaction,
  parseSolanaSignedTransaction, type AptosUnsignedRequest, type UnsignedAptosTransaction,
  type UnsignedEvmTransaction, type UnsignedNearTransaction, type UnsignedSolanaTransaction
} from "@aifinpay/shared";
import { parseTransaction, recoverTransactionAddress } from "viem";

function ed25519Key(raw: Uint8Array) {
  if (raw.length !== 32) throw new Error("Invalid Ed25519 public key.");
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(raw)]),
    format: "der",
    type: "spki"
  });
}

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
    if (!verifySignature(null, Buffer.from(message), ed25519Key(publicKeyBytes), Buffer.from(signature))) {
      throw new AppError("SIGNING_FAILED", "The Solana transaction was not signed by the connected wallet.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SIGNING_FAILED", "The signed Solana transaction is invalid or cannot be verified.");
  }
}

export function validateSignedNearTransaction(
  connectedPublicKeyHex: string,
  rawTransactionBase64: string,
  expected: UnsignedNearTransaction
): void {
  try {
    if (!/^[0-9a-f]{64}$/.test(connectedPublicKeyHex)) throw new Error("Invalid NEAR public key.");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(rawTransactionBase64)) throw new Error("Malformed base64.");
    const expectedTransaction = Buffer.from(expected.transactionBase64, "base64");
    const serialized = Buffer.from(rawTransactionBase64, "base64");
    const { transaction, signature } = parseNearSignedTransaction(serialized, expectedTransaction.length);
    if (!Buffer.from(transaction).equals(expectedTransaction)) {
      throw new AppError("SIGNING_FAILED", "The signed NEAR transaction does not match the payment you reviewed.");
    }
    const digest = createHash("sha256").update(transaction).digest();
    if (encodeBase58(digest) !== expected.transactionHash) {
      throw new AppError("SIGNING_FAILED", "The NEAR transaction hash does not match the reviewed transaction.");
    }
    if (!verifySignature(null, digest, ed25519Key(Buffer.from(connectedPublicKeyHex, "hex")), Buffer.from(signature))) {
      throw new AppError("SIGNING_FAILED", "The NEAR transaction was not signed by the connected wallet.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SIGNING_FAILED", "The signed NEAR transaction is invalid or cannot be verified.");
  }
}

export function validateSignedAptosTransaction(
  connectedAddress: string,
  rawTransactionJson: string,
  expected: UnsignedAptosTransaction
): void {
  try {
    const signed = JSON.parse(rawTransactionJson) as {
      request?: AptosUnsignedRequest;
      publicKeyHex?: string;
      signatureHex?: string;
    };
    if (!signed.request || JSON.stringify(signed.request) !== JSON.stringify(expected.request)) {
      throw new AppError("SIGNING_FAILED", "The signed Aptos request does not match the payment you reviewed.");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(signed.publicKeyHex ?? "") || !/^0x[0-9a-fA-F]{128}$/.test(signed.signatureHex ?? "")) {
      throw new Error("Malformed Aptos signature.");
    }
    const publicKey = Buffer.from(signed.publicKeyHex!.slice(2), "hex");
    const authenticationKey = createHash("sha3-256").update(Buffer.concat([publicKey, Buffer.from([0])])).digest("hex");
    const normalizedConnected = connectedAddress.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    if (authenticationKey !== normalizedConnected) {
      throw new AppError("SIGNING_FAILED", "The Aptos public key does not belong to the connected wallet.");
    }
    const message = Buffer.from(expected.signingMessageHex.slice(2), "hex");
    const signature = Buffer.from(signed.signatureHex!.slice(2), "hex");
    if (!verifySignature(null, message, ed25519Key(publicKey), signature)) {
      throw new AppError("SIGNING_FAILED", "The Aptos transaction was not signed by the connected wallet.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("SIGNING_FAILED", "The signed Aptos transaction is invalid or cannot be verified.");
  }
}
