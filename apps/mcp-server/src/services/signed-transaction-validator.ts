import { AppError, type UnsignedEvmTransaction } from "@aifinpay/shared";
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
