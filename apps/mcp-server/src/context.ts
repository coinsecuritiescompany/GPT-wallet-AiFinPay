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
import { SettlementSwapRouter } from "./services/settlement-swap-router.js";
import { UniversalMainnetAdapter } from "./services/universal-mainnet-adapter.js";
import { SwapService } from "./services/swap-service.js";
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
  readonly swaps: SwapService;
  readonly settlementSwaps: SettlementSwapRouter;
  readonly settlementExecution: SettlementExecutionService;

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
    this.adapter = config.walletMode === "mainnet"
      ? new UniversalMainnetAdapter(this.store, config.mainnetRpcUrls, config.mainnetRpcAuth)
      : new DemoLedgerAdapter();
    this.payments = new PaymentService(this.store, this.audit, this.confirmations, this.adapter, this.analytics);
    this.policies = new PolicyService(this.store, this.audit, this.confirmations);
    this.swaps = new SwapService(config.changeNowApiKey, config.sessionSecret);
    this.settlementSwaps = new SettlementSwapRouter(this.swaps);
    this.settlementExecution = new SettlementExecutionService(this.store, config, this.adapter);
    if (config.walletMode === "demo" && config.demoMode && this.store.listPolicies(DEMO_USER_ID).length === 0) this.store.savePolicy(DEMO_POLICY);
  }

  close(): void { this.store.close(); }
}
