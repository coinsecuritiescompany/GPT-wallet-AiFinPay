import { DemoLedgerAdapter, DEMO_POLICY } from "@aifinpay/demo-ledger";
import type { WalletAdapter } from "@aifinpay/aifinpay-adapter";
import { DEMO_USER_ID } from "@aifinpay/shared";
import { AuditService } from "./audit/audit-service.js";
import { SessionAuth } from "./auth/session.js";
import { AiFinPayOAuthProvider } from "./auth/oauth-provider.js";
import type { AppConfig } from "./config.js";
import { ConfirmationService } from "./services/confirmation-service.js";
import { SigningRequestService } from "./services/signing-request-service.js";
import { PaymentService } from "./services/payment-service.js";
import { PolicyService } from "./services/policy-service.js";
import { MainnetAdapter } from "./services/mainnet-adapter.js";
import { Store } from "./storage/store.js";

export class AppContext {
  readonly store: Store;
  readonly auth: SessionAuth;
  readonly oauth: AiFinPayOAuthProvider;
  readonly audit: AuditService;
  readonly confirmations: ConfirmationService;
  readonly signing: SigningRequestService;
  readonly adapter: WalletAdapter;
  readonly payments: PaymentService;
  readonly policies: PolicyService;

  constructor(readonly config: AppConfig) {
    this.store = new Store(config.databaseUrl);
    this.auth = new SessionAuth(config.demoMode);
    this.oauth = new AiFinPayOAuthProvider(config.sessionSecret, new URL(config.widgetDomain), new URL(config.publicUrl));
    this.audit = new AuditService(this.store);
    this.confirmations = new ConfirmationService(config.sessionSecret);
    this.signing = new SigningRequestService(config.sessionSecret);
    this.adapter = config.walletMode === "mainnet"
      ? new MainnetAdapter(this.store, config.mainnetRpcUrls, config.mainnetRpcAuth)
      : new DemoLedgerAdapter();
    this.payments = new PaymentService(this.store, this.audit, this.confirmations, this.adapter);
    this.policies = new PolicyService(this.store, this.audit, this.confirmations);
    if (config.walletMode === "demo" && config.demoMode && this.store.listPolicies(DEMO_USER_ID).length === 0) this.store.savePolicy(DEMO_POLICY);
  }

  close(): void { this.store.close(); }
}
