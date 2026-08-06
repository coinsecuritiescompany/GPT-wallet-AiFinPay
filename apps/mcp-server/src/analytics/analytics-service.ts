import { createHmac } from "node:crypto";
import type { Store } from "../storage/store.js";

// Product analytics for the GPT wallet, built to the spec agreed with Dimitry
// (6 Aug 2026): server-side events are authoritative for the transaction
// funnel; widget events describe UI behaviour only and are never proof that a
// transaction happened. No private keys, recovery phrases, passwords or IP
// addresses are ever recorded; users appear only as a salted HMAC of their
// already-pseudonymous wallet user id, so analytics rows cannot be joined back
// to on-chain addresses even with database access.

/** Events the server records itself. Authoritative. */
export type ServerEvent =
  | "connector_connected"      // OAuth authorization approved in the Vault
  | "vault_connected"          // wallet pairing completed / addresses linked
  | "wallet_opened"            // open_wallet / render_wallet served
  | "balance_view"             // a balance/summary tool answered
  | "transfer_prepare_started"
  | "transfer_prepared"
  | "transfer_prepare_failed"
  | "signing_request_opened"   // the Vault fetched a signing payload
  | "transaction_signed"       // a signed transaction passed validation
  | "transaction_broadcast"    // the network accepted the raw transaction
  | "transaction_confirmed"
  | "transaction_failed"
  | "transfer_cancelled"
  | "stage_error";             // any funnel stage rejected with an error code

/** Events the widget reports. Non-authoritative, source_kind = "ui". */
export type UiEvent = "widget_loaded" | "wallet_viewed" | "network_selected" | "balance_viewed" | "transfer_form_opened";
export const UI_EVENTS: readonly UiEvent[] = ["widget_loaded", "wallet_viewed", "network_selected", "balance_viewed", "transfer_form_opened"];

export interface EventDetails {
  userId?: string;
  network?: string;
  asset?: string;
  amount?: string;
  stage?: string;
  errorCode?: string;
  platform?: string;
  widgetVersion?: string;
  referral?: string;
  intentId?: string;
}

const DAY_MS = 86_400_000;

export class AnalyticsService {
  private readonly salt: string;

  constructor(private readonly store: Store, sessionSecret: string) {
    // Derive the pseudonymisation salt from the session secret so it is stable
    // across restarts but never stored anywhere an analytics reader can see.
    this.salt = createHmac("sha256", sessionSecret).update("analytics-user-salt-v1").digest("hex");
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        event TEXT NOT NULL,
        source_kind TEXT NOT NULL CHECK (source_kind IN ('server','ui')),
        user_hash TEXT,
        network TEXT,
        asset TEXT,
        amount TEXT,
        stage TEXT,
        error_code TEXT,
        platform TEXT,
        widget_version TEXT,
        referral TEXT,
        intent_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON analytics_events (ts);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events (event, ts);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_hash, ts);
      CREATE TABLE IF NOT EXISTS analytics_users (
        user_hash TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        referral TEXT
      );
    `);
  }

  /** Salted, irreversible pseudonym for a user id. Never store the id itself. */
  userHash(userId: string): string {
    return createHmac("sha256", this.salt).update(userId).digest("hex").slice(0, 24);
  }

  /**
   * Record an event. Analytics must never break the product: any failure is
   * swallowed after logging, and unknown/private fields are simply dropped.
   */
  record(event: ServerEvent | UiEvent, sourceKind: "server" | "ui", details: EventDetails = {}): void {
    try {
      const userHash = details.userId ? this.userHash(details.userId) : null;
      if (userHash) this.touchUser(userHash, details.referral);
      this.store.db.prepare(`INSERT INTO analytics_events
        (ts,event,source_kind,user_hash,network,asset,amount,stage,error_code,platform,widget_version,referral,intent_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        new Date().toISOString(), event, sourceKind, userHash,
        details.network ?? null, details.asset ?? null, details.amount ?? null,
        details.stage ?? null, details.errorCode ?? null,
        details.platform ?? null, details.widgetVersion ?? null,
        details.referral ?? null, details.intentId ?? null
      );
    } catch (error) {
      console.error(JSON.stringify({ level: "error", event: "ANALYTICS_WRITE_FAILED", detail: String(error) }));
    }
  }

  /** First-touch user registration; the first referral seen for a user wins. */
  private touchUser(userHash: string, referral?: string): void {
    this.store.db.prepare(
      "INSERT INTO analytics_users (user_hash, first_seen, referral) VALUES (?,?,?) ON CONFLICT(user_hash) DO NOTHING"
    ).run(userHash, new Date().toISOString(), referral ?? null);
    if (referral) {
      this.store.db.prepare(
        "UPDATE analytics_users SET referral=? WHERE user_hash=? AND referral IS NULL"
      ).run(referral, userHash);
    }
  }

  /** Delete raw events older than the retention window (default 180 days). */
  pruneOldEvents(retentionDays = 180, now = new Date()): number {
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS).toISOString();
    const result = this.store.db.prepare("DELETE FROM analytics_events WHERE ts < ?").run(cutoff);
    return Number(result.changes);
  }

  // ---------------------------------------------------------------- summaries

  private countDistinctUsersSince(sinceIso: string, event?: string): number {
    const row = event
      ? this.store.db.prepare("SELECT COUNT(DISTINCT user_hash) AS n FROM analytics_events WHERE ts>=? AND event=? AND user_hash IS NOT NULL").get(sinceIso, event) as { n: number }
      : this.store.db.prepare("SELECT COUNT(DISTINCT user_hash) AS n FROM analytics_events WHERE ts>=? AND user_hash IS NOT NULL").get(sinceIso) as { n: number };
    return Number(row?.n ?? 0);
  }

  summary(now = new Date()): Record<string, unknown> {
    const day = new Date(now.getTime() - DAY_MS).toISOString();
    const week = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const month = new Date(now.getTime() - 30 * DAY_MS).toISOString();

    const one = (sql: string, ...args: unknown[]): number =>
      Number((this.store.db.prepare(sql).get(...(args as [])) as { n?: number } | undefined)?.n ?? 0);
    const rows = <T>(sql: string, ...args: unknown[]): T[] =>
      this.store.db.prepare(sql).all(...(args as [])) as T[];

    // Transfers come from payment_intents — the authoritative record — never
    // from UI events.
    const intents = rows<{ json: string }>("SELECT json FROM payment_intents")
      .map((row) => JSON.parse(row.json) as { status: string; network: string; token: string; createdAt: string });
    const transfersByStatus: Record<string, number> = {};
    const completedByNetwork: Record<string, number> = {};
    const broadcastByNetwork: Record<string, number> = {};
    for (const intent of intents) {
      transfersByStatus[intent.status] = (transfersByStatus[intent.status] ?? 0) + 1;
      // "completed" must mean confirmed final — a PENDING broadcast is shown
      // separately so the dashboard never overstates what actually settled.
      if (intent.status === "COMPLETED") {
        completedByNetwork[intent.network] = (completedByNetwork[intent.network] ?? 0) + 1;
      }
      if (intent.status === "COMPLETED" || intent.status === "PENDING") {
        broadcastByNetwork[intent.network] = (broadcastByNetwork[intent.network] ?? 0) + 1;
      }
    }

    const usersOpenedWallet = this.countDistinctUsersSince("1970", "wallet_opened");
    const usersCompleted = one(
      "SELECT COUNT(DISTINCT user_hash) AS n FROM analytics_events WHERE event='transaction_confirmed' AND user_hash IS NOT NULL"
    );

    return {
      generatedAt: now.toISOString(),
      totals: {
        connectedVaults: one("SELECT COUNT(*) AS n FROM wallet_connections"),
        uniqueUsers: one("SELECT COUNT(*) AS n FROM analytics_users"),
        usersWhoOpenedWallet: usersOpenedWallet,
        usersWhoCompletedTransaction: usersCompleted,
        walletOpenToCompletedConversion: usersOpenedWallet ? Number((usersCompleted / usersOpenedWallet).toFixed(3)) : 0
      },
      activeUsers: { daily: this.countDistinctUsersSince(day), weekly: this.countDistinctUsersSince(week), monthly: this.countDistinctUsersSince(month) },
      transfers: { byStatus: transfersByStatus, completedByNetwork, broadcastByNetwork },
      funnel30d: Object.fromEntries(rows<{ event: string; n: number }>(
        "SELECT event, COUNT(*) AS n FROM analytics_events WHERE ts>=? GROUP BY event ORDER BY n DESC", month
      ).map((row) => [row.event, Number(row.n)])),
      byPlatform30d: Object.fromEntries(rows<{ platform: string; n: number }>(
        "SELECT COALESCE(platform,'unknown') AS platform, COUNT(DISTINCT user_hash) AS n FROM analytics_events WHERE ts>=? AND source_kind='ui' GROUP BY platform", month
      ).map((row) => [row.platform, Number(row.n)])),
      byWidgetVersion30d: Object.fromEntries(rows<{ widget_version: string; n: number }>(
        "SELECT COALESCE(widget_version,'unknown') AS widget_version, COUNT(*) AS n FROM analytics_events WHERE ts>=? AND widget_version IS NOT NULL GROUP BY widget_version", month
      ).map((row) => [row.widget_version, Number(row.n)])),
      networkSelections30d: Object.fromEntries(rows<{ network: string; n: number }>(
        "SELECT network, COUNT(*) AS n FROM analytics_events WHERE ts>=? AND event='network_selected' AND network IS NOT NULL GROUP BY network", month
      ).map((row) => [row.network, Number(row.n)])),
      errors30d: rows<{ stage: string; error_code: string; n: number }>(
        "SELECT COALESCE(stage,'?') AS stage, COALESCE(error_code,'?') AS error_code, COUNT(*) AS n FROM analytics_events WHERE ts>=? AND event='stage_error' GROUP BY stage, error_code ORDER BY n DESC LIMIT 20", month
      ),
      referrals: Object.fromEntries(rows<{ referral: string; n: number }>(
        "SELECT COALESCE(referral,'organic') AS referral, COUNT(*) AS n FROM analytics_users GROUP BY referral"
      ).map((row) => [row.referral, Number(row.n)])),
      dailyActive14d: rows<{ day: string; n: number }>(
        "SELECT substr(ts,1,10) AS day, COUNT(DISTINCT user_hash) AS n FROM analytics_events WHERE ts>=? AND user_hash IS NOT NULL GROUP BY day ORDER BY day",
        new Date(now.getTime() - 14 * DAY_MS).toISOString()
      )
    };
  }

  /** The casper-community slice Dimitry asked to see on its own. */
  communitySlice(referral = "casper-community"): Record<string, unknown> {
    const users = this.store.db.prepare("SELECT user_hash FROM analytics_users WHERE referral=?").all(referral) as Array<{ user_hash: string }>;
    const hashes = new Set(users.map((row) => row.user_hash));
    if (!hashes.size) return { referral, users: 0, confirmed: 0, failed: 0 };
    const placeholders = [...hashes].map(() => "?").join(",");
    const count = (event: string): number => Number((this.store.db.prepare(
      `SELECT COUNT(*) AS n FROM analytics_events WHERE event=? AND user_hash IN (${placeholders})`
    ).get(event, ...hashes) as { n?: number })?.n ?? 0);
    return {
      referral,
      users: hashes.size,
      walletOpens: count("wallet_opened"),
      prepared: count("transfer_prepared"),
      signed: count("transaction_signed"),
      confirmed: count("transaction_confirmed"),
      failed: count("transaction_failed")
    };
  }
}
