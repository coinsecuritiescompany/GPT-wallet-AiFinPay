import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentPolicy, AuditEvent, PaymentIntent } from "@aifinpay/shared";

export type WalletPairingResult = "connected" | "already_connected" | "invalid";
export interface StoredWalletAddresses { evm: string; solana: string; near: string; aptos: string }

function sameAddresses(left: Record<string, string>, right: StoredWalletAddresses): boolean {
  return (["evm", "solana", "near", "aptos"] as const).every((key) => {
    const a = left[key] ?? "";
    const b = right[key] ?? "";
    return key === "evm" ? a.toLowerCase() === b.toLowerCase() : a === b;
  });
}

export class Store {
  readonly db: DatabaseSync;

  constructor(databaseUrl: string) {
    if (databaseUrl !== ":memory:") mkdirSync(dirname(databaseUrl), { recursive: true });
    this.db = new DatabaseSync(databaseUrl);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS payment_intents (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL, status TEXT NOT NULL, json TEXT NOT NULL,
        UNIQUE(user_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS agent_policies (
        policy_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, agent_id TEXT NOT NULL, enabled INTEGER NOT NULL, json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, user_id TEXT NOT NULL, agent_id TEXT,
        action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
        decision TEXT NOT NULL, reason_code TEXT NOT NULL, metadata_hash TEXT NOT NULL,
        previous_hash TEXT NOT NULL, current_hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_pairings (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS wallet_connections (
        user_id TEXT PRIMARY KEY, addresses_json TEXT NOT NULL, connected_at TEXT NOT NULL
      );
    `);
  }

  close(): void { this.db.close(); }

  saveIntent(intent: PaymentIntent, requestHash: string): void {
    this.db.prepare(`INSERT INTO payment_intents (id,user_id,idempotency_key,request_hash,status,json)
      VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,json=excluded.json`)
      .run(intent.id, intent.ownerUserId, intent.idempotencyKey, requestHash, intent.status, JSON.stringify(intent));
  }

  getIntent(id: string, userId: string): PaymentIntent | null {
    const row = this.db.prepare("SELECT json FROM payment_intents WHERE id=? AND user_id=?").get(id, userId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as PaymentIntent : null;
  }

  getIntentByIdempotency(userId: string, key: string): { intent: PaymentIntent; requestHash: string } | null {
    const row = this.db.prepare("SELECT json,request_hash FROM payment_intents WHERE user_id=? AND idempotency_key=?").get(userId, key) as { json: string; request_hash: string } | undefined;
    return row ? { intent: JSON.parse(row.json) as PaymentIntent, requestHash: row.request_hash } : null;
  }

  findIntentByHash(hash: string, userId: string): PaymentIntent | null {
    const rows = this.db.prepare("SELECT json FROM payment_intents WHERE user_id=?").all(userId) as Array<{ json: string }>;
    return rows.map((row) => JSON.parse(row.json) as PaymentIntent).find((intent) => intent.transactionHash === hash) ?? null;
  }

  savePolicy(policy: AgentPolicy): void {
    this.db.prepare(`INSERT INTO agent_policies (policy_id,user_id,agent_id,enabled,json) VALUES (?,?,?,?,?)
      ON CONFLICT(policy_id) DO UPDATE SET agent_id=excluded.agent_id,enabled=excluded.enabled,json=excluded.json`)
      .run(policy.policyId, policy.ownerUserId, policy.agentId, policy.enabled ? 1 : 0, JSON.stringify(policy));
  }

  getPolicy(policyId: string, userId: string): AgentPolicy | null {
    const row = this.db.prepare("SELECT json FROM agent_policies WHERE policy_id=? AND user_id=?").get(policyId, userId) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as AgentPolicy : null;
  }

  listPolicies(userId: string): AgentPolicy[] {
    const rows = this.db.prepare("SELECT json FROM agent_policies WHERE user_id=? ORDER BY agent_id").all(userId) as Array<{ json: string }>;
    return rows.map((row) => JSON.parse(row.json) as AgentPolicy);
  }

  appendAudit(event: AuditEvent): void {
    this.db.prepare(`INSERT INTO audit_events
      (id,timestamp,user_id,agent_id,action,entity_type,entity_id,decision,reason_code,metadata_hash,previous_hash,current_hash)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(event.id, event.timestamp, event.userId, event.agentId, event.action,
      event.entityType, event.entityId, event.decision, event.reasonCode, event.metadataHash, event.previousHash, event.currentHash);
  }

  latestAuditHash(): string {
    const row = this.db.prepare("SELECT current_hash FROM audit_events ORDER BY rowid DESC LIMIT 1").get() as { current_hash: string } | undefined;
    return row?.current_hash ?? "GENESIS";
  }

  listAudit(userId: string, limit = 50): AuditEvent[] {
    return this.db.prepare("SELECT * FROM audit_events WHERE user_id=? ORDER BY rowid DESC LIMIT ?").all(userId, limit).map((row: any) => ({
      id: row.id, timestamp: row.timestamp, userId: row.user_id, agentId: row.agent_id,
      action: row.action, entityType: row.entity_type, entityId: row.entity_id, decision: row.decision,
      reasonCode: row.reason_code, metadataHash: row.metadata_hash, previousHash: row.previous_hash, currentHash: row.current_hash
    })) as AuditEvent[];
  }

  createWalletPairing(tokenHash: string, userId: string, expiresAt: string): void {
    this.db.prepare("DELETE FROM wallet_pairings WHERE user_id=? OR expires_at<=?").run(userId, new Date().toISOString());
    this.db.prepare("INSERT INTO wallet_pairings (token_hash,user_id,expires_at,consumed) VALUES (?,?,?,0)").run(tokenHash, userId, expiresAt);
  }

  completeWalletPairing(tokenHash: string, addresses: StoredWalletAddresses): WalletPairingResult {
    const now = new Date().toISOString();
    const row = this.db.prepare("SELECT user_id,expires_at,consumed FROM wallet_pairings WHERE token_hash=?").get(tokenHash) as { user_id: string; expires_at: string; consumed: number } | undefined;
    if (!row) return "invalid";
    if (row.consumed) {
      const connection = this.getWalletConnection(row.user_id);
      return connection && sameAddresses(connection.addresses, addresses) ? "already_connected" : "invalid";
    }
    if (row.expires_at <= now) return "invalid";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE wallet_pairings SET consumed=1 WHERE token_hash=? AND consumed=0").run(tokenHash);
      this.db.prepare(`INSERT INTO wallet_connections (user_id,addresses_json,connected_at) VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET addresses_json=excluded.addresses_json,connected_at=excluded.connected_at`)
        .run(row.user_id, JSON.stringify(addresses), now);
      this.db.exec("COMMIT");
      return "connected";
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getWalletConnection(userId: string): { addresses: Record<string, string>; connectedAt: string } | null {
    const row = this.db.prepare("SELECT addresses_json,connected_at FROM wallet_connections WHERE user_id=?").get(userId) as { addresses_json: string; connected_at: string } | undefined;
    return row ? { addresses: JSON.parse(row.addresses_json) as Record<string, string>, connectedAt: row.connected_at } : null;
  }

  upsertWalletConnection(userId: string, addresses: StoredWalletAddresses, connectedAt = new Date().toISOString()): void {
    this.db.prepare(`INSERT INTO wallet_connections (user_id,addresses_json,connected_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET addresses_json=excluded.addresses_json,connected_at=excluded.connected_at`)
      .run(userId, JSON.stringify(addresses), connectedAt);
  }
}
