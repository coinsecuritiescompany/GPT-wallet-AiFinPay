import { describe, expect, it } from "vitest";
import {
  attachCasperApproval, buildCasperTransferDeploy, bytesToHex, casperAccountHash, hexToBytes
} from "./casper-transfer.js";

// The expected hashes below were produced by the official casper-js-sdk for the
// same inputs and then pinned here, so a change to our hand-rolled bytesrepr
// encoding fails loudly instead of producing a deploy the network rejects.
const SENDER = "01d92f9915ff6c42524153e62297ba993619cdb8bdaf69143c1b14d9b3c61b968a";
const RECIPIENT = "01885202118548936ec2ce6674a18969d6cc7bf4003ebb30b26683bb77780474b4";
const FIXED = {
  amountMotes: 2_500_000_000n,
  paymentMotes: 100_000_000n,
  chainName: "casper-test",
  timestampMs: 1_785_900_000_000,
  ttlMs: 1_800_000,
  id: 1n
};

describe("casper transfer codec", () => {
  it("matches the deploy and body hashes produced by casper-js-sdk", () => {
    const deploy = buildCasperTransferDeploy({
      senderPublicKeyHex: SENDER,
      recipientPublicKeyHex: RECIPIENT,
      ...FIXED
    });
    expect(deploy.bodyHashHex).toBe("c98ccf5c90e8ef39463beaa8f79b3b9ba9deb30c4e70a0feb5ad7071f2431126");
    expect(deploy.deployHashHex).toBe("981b0abf2c3c20ae2e68b493eef52bc27db46bfaa03448b06430fb144b7783fb");
  });

  it("puts the hash, chain name and ttl in the envelope the node expects", () => {
    const { deployJson } = buildCasperTransferDeploy({
      senderPublicKeyHex: SENDER,
      recipientPublicKeyHex: RECIPIENT,
      ...FIXED
    });
    const header = deployJson.header as Record<string, unknown>;
    expect(header.chain_name).toBe("casper-test");
    expect(header.ttl).toBe("30m");
    expect(header.gas_price).toBe(1);
    expect(header.dependencies).toEqual([]);
    expect(deployJson.approvals).toEqual([]);
    expect(deployJson.hash).toBe("981b0abf2c3c20ae2e68b493eef52bc27db46bfaa03448b06430fb144b7783fb");
  });

  it("changes the deploy hash when any signed field changes", () => {
    const base = buildCasperTransferDeploy({ senderPublicKeyHex: SENDER, recipientPublicKeyHex: RECIPIENT, ...FIXED });
    const otherAmount = buildCasperTransferDeploy({
      senderPublicKeyHex: SENDER, recipientPublicKeyHex: RECIPIENT, ...FIXED, amountMotes: 2_500_000_001n
    });
    const otherChain = buildCasperTransferDeploy({
      senderPublicKeyHex: SENDER, recipientPublicKeyHex: RECIPIENT, ...FIXED, chainName: "casper"
    });
    expect(otherAmount.deployHashHex).not.toBe(base.deployHashHex);
    expect(otherChain.deployHashHex).not.toBe(base.deployHashHex);
  });

  it("rejects keys and amounts the network would refuse", () => {
    const valid = { senderPublicKeyHex: SENDER, recipientPublicKeyHex: RECIPIENT, ...FIXED };
    expect(() => buildCasperTransferDeploy({ ...valid, senderPublicKeyHex: "02" + SENDER.slice(2) }))
      .toThrow(/ed25519/);
    expect(() => buildCasperTransferDeploy({ ...valid, recipientPublicKeyHex: "01ff" })).toThrow(/ed25519/);
    expect(() => buildCasperTransferDeploy({ ...valid, amountMotes: 0n })).toThrow(/positive/);
    expect(() => buildCasperTransferDeploy({ ...valid, paymentMotes: 0n })).toThrow(/positive/);
  });

  it("attaches an approval with the algorithm tag Casper expects", () => {
    const { deployJson } = buildCasperTransferDeploy({ senderPublicKeyHex: SENDER, recipientPublicKeyHex: RECIPIENT, ...FIXED });
    const signature = "ab".repeat(64);
    const signed = attachCasperApproval(deployJson, SENDER, signature);
    expect(signed.approvals).toEqual([{ signer: SENDER, signature: `01${signature}` }]);
    // The unsigned envelope must not be mutated — it is what the validator compares against.
    expect(deployJson.approvals).toEqual([]);
    expect(() => attachCasperApproval(deployJson, SENDER, "ab")).toThrow(/64-byte/);
  });

  it("round-trips hex and derives the account hash", () => {
    expect(bytesToHex(hexToBytes("0x00ff10"))).toBe("00ff10");
    expect(() => hexToBytes("nothex")).toThrow(/hexadecimal/);
    expect(casperAccountHash(SENDER)).toMatch(/^[0-9a-f]{64}$/);
  });
});
