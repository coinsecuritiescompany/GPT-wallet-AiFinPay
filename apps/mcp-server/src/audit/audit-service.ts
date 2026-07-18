import { createHash } from "node:crypto";
import type { AuditEvent } from "@aifinpay/shared";
import type { Store } from "../storage/store.js";

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export class AuditService {
  constructor(private readonly store: Store) {}

  record(input: Omit<AuditEvent, "id" | "timestamp" | "metadataHash" | "previousHash" | "currentHash"> & { metadata?: Record<string, unknown> }): AuditEvent {
    const timestamp = new Date().toISOString();
    const metadataHash = hash(JSON.stringify(input.metadata ?? {}));
    const previousHash = this.store.latestAuditHash();
    const id = `audit_${hash(`${timestamp}:${input.action}:${input.entityId}:${previousHash}`).slice(0, 20)}`;
    const currentHash = hash([previousHash, id, timestamp, input.userId, input.agentId ?? "", input.action, input.entityType, input.entityId, input.decision, input.reasonCode, metadataHash].join("|"));
    const event: AuditEvent = {
      id, timestamp, userId: input.userId, agentId: input.agentId, action: input.action,
      entityType: input.entityType, entityId: input.entityId, decision: input.decision,
      reasonCode: input.reasonCode, metadataHash, previousHash, currentHash
    };
    this.store.appendAudit(event);
    return event;
  }

  verify(events: AuditEvent[]): boolean {
    const chronological = [...events].reverse();
    let previousHash = "GENESIS";
    for (const event of chronological) {
      if (event.previousHash !== previousHash) return false;
      const expected = hash([event.previousHash, event.id, event.timestamp, event.userId, event.agentId ?? "", event.action, event.entityType, event.entityId, event.decision, event.reasonCode, event.metadataHash].join("|"));
      if (expected !== event.currentHash) return false;
      previousHash = event.currentHash;
    }
    return true;
  }
}

