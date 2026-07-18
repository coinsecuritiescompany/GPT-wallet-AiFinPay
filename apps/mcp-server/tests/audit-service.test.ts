import { afterEach, describe, expect, it } from "vitest";
import { AuditService } from "../src/audit/audit-service.js";
import { Store } from "../src/storage/store.js";

describe("audit hash chain", () => {
  const stores: Store[] = [];
  afterEach(() => stores.splice(0).forEach((store) => store.close()));
  it("verifies intact events and detects tampering", () => {
    const store = new Store(":memory:"); stores.push(store); const audit = new AuditService(store);
    audit.record({ userId: "u", agentId: null, action: "A", entityType: "Test", entityId: "1", decision: "OK", reasonCode: "ONE" });
    audit.record({ userId: "u", agentId: null, action: "B", entityType: "Test", entityId: "2", decision: "OK", reasonCode: "TWO" });
    expect(audit.verify(store.listAudit("u"))).toBe(true);
    store.db.exec("UPDATE audit_events SET decision='TAMPERED' WHERE action='A'");
    expect(audit.verify(store.listAudit("u"))).toBe(false);
  });
});

