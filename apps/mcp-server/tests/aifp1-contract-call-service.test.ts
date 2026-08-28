import { describe, expect, it } from "vitest";
import { encodeFunctionData } from "viem";
import { AuditService } from "../src/audit/audit-service.js";
import type { TrustedAifp1Route } from "../src/config.js";
import { Aifp1ContractCallService } from "../src/services/aifp1-contract-call-service.js";
import { Store } from "../src/storage/store.js";

const ABI = [{
  type: "function",
  name: "payNative",
  stateMutability: "payable",
  inputs: [{
    name: "_payment",
    type: "tuple",
    components: [
      { name: "paymentId", type: "bytes32" },
      { name: "merchant", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "ipCreator", type: "address" },
      { name: "validUntil", type: "uint256" },
      { name: "orderId", type: "string" }
    ]
  }],
  outputs: []
}] as const;

const contract = "0x1111111111111111111111111111111111111111";
const merchant = "0x2222222222222222222222222222222222222222";
const zero = "0x0000000000000000000000000000000000000000";
const paymentId = `0x${"12".repeat(32)}` as `0x${string}`;

function fixture(ipCreator = zero, validUntil = Math.floor(Date.now() / 1000) + 300) {
  const data = encodeFunctionData({
    abi: ABI,
    functionName: "payNative",
    args: [{ paymentId, merchant, grossAmount: 1000000000000000n, ipCreator, validUntil: BigInt(validUntil), orderId: "qt_test" }]
  });
  const route: TrustedAifp1Route = {
    network: "POLYGON",
    chainId: 137,
    contract,
    runtimeCodeHash: `0x${"34".repeat(32)}`,
    selector: data.slice(0, 10).toLowerCase(),
    routeClass: "merchant-aifp1",
    splitterVersion: "1.3",
    economicsProfile: "AIFP-1:100/0:gross"
  };
  return { data, route };
}

function service(routes: TrustedAifp1Route[]) {
  const store = new Store(":memory:");
  return { store, value: new Aifp1ContractCallService(store, new AuditService(store), routes, 1) };
}

describe("AIFP-1 contract-call intent", () => {
  it("accepts only an exact trusted v1.3 payNative transaction", () => {
    const { data, route } = fixture();
    const { store, value } = service([route]);
    const prepared = value.prepare("user-1", {
      network: "POLYGON",
      chainId: 137,
      to: contract,
      value: "1000000000000000",
      data,
      grossUsd: "0.10",
      initiatedByAgentId: "agent-1",
      idempotencyKey: "aifp1-test-001"
    });
    expect(prepared.intent.contractCall?.contract).toBe(contract);
    expect(prepared.intent.contractCall?.merchant).toBe(merchant);
    expect(prepared.intent.contractCall?.ipCreator).toBe(zero);
    expect(prepared.intent.contractCall?.valueBaseUnits).toBe("1000000000000000");
    expect(prepared.intent.recipient).toBe(contract);
    store.close();
  });

  it("blocks a direct-value mismatch before signing", () => {
    const { data, route } = fixture();
    const { store, value } = service([route]);
    expect(() => value.prepare("user-1", {
      network: "POLYGON", chainId: 137, to: contract, value: "999", data, grossUsd: "0.10", idempotencyKey: "aifp1-test-002"
    })).toThrow(/exactly equal/i);
    store.close();
  });

  it("blocks creator value on the AIFP-1 100/0 profile", () => {
    const { data, route } = fixture("0x3333333333333333333333333333333333333333");
    const { store, value } = service([route]);
    expect(() => value.prepare("user-1", {
      network: "POLYGON", chainId: 137, to: contract, value: "1000000000000000", data, grossUsd: "0.10", idempotencyKey: "aifp1-test-003"
    })).toThrow(/creator=0/i);
    store.close();
  });

  it("blocks a contract that is not independently pinned", () => {
    const { data } = fixture();
    const { store, value } = service([]);
    expect(() => value.prepare("user-1", {
      network: "POLYGON", chainId: 137, to: contract, value: "1000000000000000", data, grossUsd: "0.10", idempotencyKey: "aifp1-test-004"
    })).toThrow(/not independently trusted/i);
    store.close();
  });
});
