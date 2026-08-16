import { DemoLedgerAdapter, DEMO_POLICY } from "@aifinpay/demo-ledger";
import type { WalletAdapter } from "@aifinpay/aifinpay-adapter";
import { DEMO_USER_ID } from "@aifinpay/shared";
import { AnalyticsService } from "./analytics/analytics-service.js";
import { AuditService } from "./audit/audit-service.js";
import { SessionAuth } from "./auth/session.js";
import { AiFinPayOAuthProvider } from "./auth/oauth-provider.js";
import type { AppConfig } from "./config.js";
import { ConfirmationService } from "./services/confirmation-service.js";
import { SigningRequestService } from "./services/signing-request-service.js";
import { PaymentService } from "./services/payment-service.js";
import { PolicyService } from "./services/policy-service.js";
import { SettlementExecutionService } from "./services/settlement-execution-service.js";
import { TreasuryAccountingService } from "./services/treasury-accounting-service.js";
import { UniversalMainnetAdapter } from "./services/universal-mainnet-adapter.js";
import { Store } from "./storage/store.js";

export class AppContext {
  readonly store: Store;
  readonly auth: SessionAuth;
  readonly oauth: AiFinPayOAuthProvider;
  readonly audit: AuditService;
  readonly analytics: AnalyticsService;
  readonly confirmations: ConfirmationService;
  readonly signing: SigningRequestService;
  readonly adapter: WalletAdapter;
  readonly payments: PaymentService;
  readonly policies: PolicyService;
  readonly settlementExecution: SettlementExecutionService;
  readonly treasury?: TreasuryAccountingService;
  private treasuryTimer?: NodeJS.Timeout;
  private treasuryStarted = false;

  constructor(readonly config: AppConfig) {
    this.store = new Store(config.databaseUrl);
    this.analytics = new AnalyticsService(this.store, config.sessionSecret);
    this.auth = new SessionAuth(config.demoMode);
    this.oauth = new AiFinPayOAuthProvider(
      config.sessionSecret,
      new URL(config.widgetDomain),
      new URL(config.publicUrl),
      (codeHash, expiresAt) => this.store.consumeOAuthAuthorizationCode(codeHash, expiresAt),
      (userId, referral) => {
        this.analytics.record("connector_connected", "server", { userId, ...(referral ? { referral } : {}) });
        this.analytics.record("vault_connected", "server", { userId, ...(referral ? { referral } : {}) });
      }
    );
    this.audit = new AuditService(this.store);
    this.confirmations = new ConfirmationService(config.sessionSecret);
    this.signing = new SigningRequestService(config.sessionSecret);

    const mainnetAdapter = config.walletMode === "mainnet"
      ? new UniversalMainnetAdapter(this.store, config.mainnetRpcUrls, config.mainnetRpcAuth)
      : undefined;
    this.adapter = mainnetAdapter ?? new DemoLedgerAdapter();
    this.payments = new PaymentService(this.store, this.audit, this.confirmations, this.adapter, this.analytics);
    this.policies = new PolicyService(this.store, this.audit, this.confirmations);
    this.settlementExecution = new SettlementExecutionService(this.store, config, this.adapter);

    // Treasury is read-only accounting. It never owns a signing key and never
    // swaps, bridges, forwards or otherwise moves protocol funds.
    if (config.treasury?.enabled) {
      if (!mainnetAdapter) throw new Error("Treasury accounting requires mainnet RPC mode");
      this.treasury = new TreasuryAccountingService(this.store, config);
      this.startTreasuryAccounting();
    }
    if (config.walletMode === "demo" && config.demoMode && this.store.listPolicies(DEMO_USER_ID).length === 0) this.store.savePolicy(DEMO_POLICY);
  }

  private startTreasuryAccounting(): void {
    if (!this.treasury || this.treasuryStarted) return;
    this.treasuryStarted = true;
    const run = async () => {
      try {
        const snapshot = await this.treasury!.snapshotAll();
        console.log(JSON.stringify({
          level: snapshot.errors.length ? "warn" : "info",
          event: "TREASURY_ACCOUNTING_SNAPSHOT",
          observed: snapshot.observed.length,
          errors: snapshot.errors,
        }));
      } catch (error) {
        console.error(JSON.stringify({
          level: "error", event: "TREASURY_ACCOUNTING_ERROR",
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    };
    const intervalSeconds = this.config.treasury?.intervalSeconds ?? 900;
    void this.treasury.verifyReadiness().then(() => run()).catch((error) => {
      console.error(JSON.stringify({
        level: "error", event: "TREASURY_ACCOUNTING_NOT_READY",
        error: error instanceof Error ? error.message : String(error),
      }));
    });
    this.treasuryTimer = setInterval(() => { void run(); }, intervalSeconds * 1000);
    this.treasuryTimer.unref();
  }

  close(): void {
    if (this.treasuryTimer) clearInterval(this.treasuryTimer);
    this.store.close();
  }
}
