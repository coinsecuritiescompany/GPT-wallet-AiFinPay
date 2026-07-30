import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { UnsignedEvmTransaction } from "@aifinpay/shared";
import { validateSignedEvmTransaction } from "../src/services/signed-transaction-validator.js";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const otherAccount = privateKeyToAccount(`0x${"22".repeat(32)}`);
const transaction: UnsignedEvmTransaction = {
  to: "0x2222222222222222222222222222222222222222",
  value: "0xde0b6b3a7640000",
  data: "0x",
  nonce: 7,
  gas: "0x5208",
  maxFeePerGas: "0x9502f9000",
  maxPriorityFeePerGas: "0x77359400",
  chainId: 137
};

async function sign(signer = account, source = transaction): Promise<`0x${string}`> {
  return signer.signTransaction({
    type: "eip1559",
    chainId: source.chainId,
    to: source.to as `0x${string}`,
    value: BigInt(source.value),
    data: source.data as `0x${string}`,
    nonce: source.nonce,
    gas: BigInt(source.gas),
    maxFeePerGas: BigInt(source.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(source.maxPriorityFeePerGas)
  });
}

describe("signed EVM transaction validation", () => {
  it("accepts the exact reviewed transaction signed by the connected address", async () => {
    await expect(validateSignedEvmTransaction(account.address, await sign(), transaction)).resolves.toBeUndefined();
  });

  it("rejects a signed transaction whose amount differs from the reviewed amount", async () => {
    const changed = { ...transaction, value: "0x1" };
    await expect(validateSignedEvmTransaction(account.address, await sign(account, changed), transaction))
      .rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });

  it("rejects a correct transaction signed by a different wallet", async () => {
    await expect(validateSignedEvmTransaction(account.address, await sign(otherAccount), transaction))
      .rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });

  it("rejects malformed or non-EIP-1559 signed bytes", async () => {
    await expect(validateSignedEvmTransaction(account.address, "0xdeadbeef", transaction))
      .rejects.toMatchObject({ code: "SIGNING_FAILED" });
  });
});
