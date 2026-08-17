import { describe, expect, it } from "vitest";
import { buildCasperSettlementDeploy } from "./index.js";

const params = {
  senderPublicKeyHex: `01${"11".repeat(32)}`,
  contractHash: `contract-${"22".repeat(32)}`,
  route: 1 as const,
  merchantAccountHash: `account-hash-${"33".repeat(32)}`,
  grossAmountMotes: 10_000_000_000n,
  requestId: "aifp:test-payment-1",
  validUntilMs: 1_800_000_000_000n,
  paymentMotes: 3_000_000_000n,
  chainName: "casper",
  timestampMs: 1_799_999_400_000,
  ttlMs: 1_800_000
};

describe("Casper canonical settlement deploy", () => {
  it("builds a deterministic StoredContractByHash pay session", () => {
    const first = buildCasperSettlementDeploy(params);
    const second = buildCasperSettlementDeploy(params);
    expect(second).toEqual(first);
    expect(first.deployHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bodyHashHex).toMatch(/^[0-9a-f]{64}$/);
    const session = (first.deployJson.session as any).StoredContractByHash;
    expect(session.hash).toBe("22".repeat(32));
    expect(session.entry_point).toBe("pay");
    expect(session.args.map((entry: any[]) => entry[0])).toEqual([
      "route", "merchant", "gross_amount", "request_id", "valid_until_ms"
    ]);
    expect(session.args[0][1]).toMatchObject({ cl_type: "U8", bytes: "01", parsed: 1 });
    expect(session.args[2][1]).toMatchObject({ cl_type: "U512", parsed: "10000000000" });
    expect(session.args[4][1]).toMatchObject({ cl_type: "U64", parsed: "1800000000000" });
  });

  it("fails closed on malformed contract, merchant, route and expiry", () => {
    expect(() => buildCasperSettlementDeploy({ ...params, contractHash: "contract-deadbeef" })).toThrow();
    expect(() => buildCasperSettlementDeploy({ ...params, merchantAccountHash: "bad" })).toThrow();
    expect(() => buildCasperSettlementDeploy({ ...params, route: 3 as 1 })).toThrow();
    expect(() => buildCasperSettlementDeploy({ ...params, validUntilMs: BigInt(params.timestampMs) })).toThrow();
  });
});
