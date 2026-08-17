import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import compression from "compression";
import express, { type Request, type Response } from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AppError, LIVE_NETWORKS, paymentAssetSpec, safeError, type VaultSignRequest } from "@aifinpay/shared";
import { loadConfig } from "./config.js";
import { AppContext } from "./context.js";
import type { PublicWalletAddresses } from "./auth/oauth-provider.js";
import { landingPage, privacyPage, supportPage, termsPage } from "./public-pages.js";
import { appIconPng, createMcpServer, vaultHtml, widgetHtml } from "./server.js";
import {
  validateSignedAptosTransaction, validateSignedCasperTransaction, validateSignedEvmTransaction,
  validateSignedNearTransaction, validateSignedSolanaTransaction
} from "./services/signed-transaction-validator.js";
import { WIDGET_URI } from "./tools/register-tools.js";

const config = loadConfig();
const context = new AppContext(config);
const startedAt = Date.now();
const app = express();
const issuerUrl = new URL(config.widgetDomain.replace(/\/$/, "") + "/");
const resourceUrl = new URL(config.publicUrl);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(compression({ threshold: 1_024 }));

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(name: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: () => void) => {
    const now = Date.now();
    const key = `${name}:${req.ip || req.socket.remoteAddress || "unknown"}`;
    const current = rateBuckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    if (bucket.count > max) {
      res.status(429).set({
        "cache-control": "no-store",
        "retry-after": String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)))
      }).json({ error: "RATE_LIMITED" });
      return;
    }
    if (rateBuckets.size > 10_000) {
      for (const [bucketKey, value] of rateBuckets) if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
    next();
  };
}

function sendHtml(res: Response, html: string, allowSelfConnect = false): void {
  res.status(200).set({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src ${allowSelfConnect ? "'self'" : "'none'"}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  }).send(html);
}

function validAddresses(value: unknown): PublicWalletAddresses | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const addresses = value as Record<string, unknown>;
  const evm = typeof addresses.evm === "string" ? addresses.evm : "";
  const solana = typeof addresses.solana === "string" ? addresses.solana : "";
  const near = typeof addresses.near === "string" ? addresses.near : "";
  const aptos = typeof addresses.aptos === "string" ? addresses.aptos : "";
  const casper = typeof addresses.casper === "string" ? addresses.casper : "";
  if (
    !/^0x[a-fA-F0-9]{40}$/.test(evm)
    || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solana)
    || !/^[a-f0-9]{64}$/.test(near)
    || !/^0x[a-f0-9]{64}$/.test(aptos)
    || !/^0(1[a-fA-F0-9]{64}|2[a-fA-F0-9]{66})$/.test(casper)
  ) return null;
  return { evm, solana, near, aptos, casper };
}

app.use(mcpAuthRouter({
  provider: context.oauth,
  issuerUrl,
  baseUrl: issuerUrl,
  resourceServerUrl: resourceUrl,
  resourceName: "AiFinPay Wallet",
  serviceDocumentationUrl: new URL("/support", issuerUrl),
  scopesSupported: ["wallet:read", "wallet:write"]
}));

app.options("/mcp", (_req, res) => {
  res.status(204).set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
    "Access-Control-Expose-Headers": "Mcp-Session-Id"
  }).end();
});

app.get("/health", (_req, res) => {
  res.status(200).set({ "cache-control": "no-store", "x-content-type-options": "nosniff" }).json({
    status: "ok",
    version: "0.3.0",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    demoMode: config.demoMode,
    walletMode: config.walletMode,
    signingNetworks: config.signingNetworks,
    authentication: "oauth-2.1-pkce",
    tokenData: "public-addresses-only",
    database: "ok",
    blockchainAdapter: context.adapter.kind,
    paymentArchitecture: "aifinpay-native-routes-no-external-swap-bridge",
    widgetResource: WIDGET_URI,
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? "local"
  });
});

app.get("/icon.png", (_req, res) => {
  const icon = appIconPng();
  if (!icon) { res.status(404).send("Icon not found"); return; }
  res.status(200).set({ "content-type": "image/png", "content-length": String(icon.byteLength), "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" }).send(icon);
});

function referralFromCookie(req: Request): string | undefined {
  const match = /(?:^|;\s*)afp_src=([A-Za-z0-9_-]{1,40})(?:;|$)/.exec(req.headers.cookie ?? "");
  return match?.[1];
}

app.get("/", (req, res) => {
  const src = typeof req.query.src === "string" ? req.query.src : "";
  if (/^[A-Za-z0-9_-]{1,40}$/.test(src)) {
    res.append("set-cookie", `afp_src=${src}; Max-Age=${30 * 86_400}; Path=/; Secure; HttpOnly; SameSite=Lax`);
  }
  sendHtml(res, landingPage(config.publicUrl));
});
app.get("/preview", (_req, res) => sendHtml(res, widgetHtml()));
app.get("/vault", (_req, res) => sendHtml(res, vaultHtml(), true));
app.get("/privacy", (_req, res) => sendHtml(res, privacyPage()));
app.get("/terms", (_req, res) => sendHtml(res, termsPage()));
app.get("/support", (_req, res) => sendHtml(res, supportPage()));

app.post("/api/oauth/approve", rateLimit("oauth-approve", 20, 10 * 60_000), express.json({ limit: "16kb", type: "application/json" }), (req, res) => {
  try {
    const request = typeof req.body?.request === "string" ? req.body.request : "";
    const addresses = validAddresses(req.body?.addresses);
    if (!request.startsWith("afp1.authorize.") || !addresses) { res.status(400).json({ error: "INVALID_AUTHORIZATION_APPROVAL" }); return; }
    res.status(200).set("cache-control", "no-store").json({ redirectUrl: context.oauth.approveAuthorization(request, addresses, referralFromCookie(req)) });
  } catch {
    res.status(410).set("cache-control", "no-store").json({ error: "AUTHORIZATION_EXPIRED_OR_INVALID" });
  }
});

app.post("/api/vault/pair", rateLimit("vault-pair", 30, 10 * 60_000), express.json({ limit: "16kb", type: "application/json" }), (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const addresses = validAddresses(req.body?.addresses);
  if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !addresses) { res.status(400).json({ error: "INVALID_PAIRING_REQUEST" }); return; }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pairingUser = context.store.pairingUserId(tokenHash);
  const result = context.store.completeWalletPairing(tokenHash, addresses);
  if (result === "connected" && pairingUser) {
    context.analytics.record("vault_connected", "server", { userId: pairingUser, ...(referralFromCookie(req) ? { referral: referralFromCookie(req) } : {}) });
  }
  res.status(result === "invalid" ? 410 : 200).json(result === "invalid" ? { error: "PAIRING_EXPIRED_OR_UNKNOWN" } : { connected: true, alreadyConnected: result === "already_connected" });
});

function signingEnabledFor(network: string): boolean {
  return config.walletMode === "mainnet" && (config.signingNetworks as string[]).includes(network);
}

function respondSigningError(res: Response, error: unknown): void {
  const safe = safeError(error);
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).set("cache-control", "no-store").json({ error: safe.code, message: safe.message });
}

app.post("/api/vault/sign-request", rateLimit("sign-request", 30, 10 * 60_000), express.json({ limit: "16kb", type: "application/json" }), async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const claims = context.signing.verify(token);
    if (!claims) { res.status(410).set("cache-control", "no-store").json({ error: "SIGN_REQUEST_EXPIRED_OR_INVALID" }); return; }

    const settlement = context.settlementExecution.getSession(claims.userId, claims.intentId);
    if (settlement) {
      if (settlement.status !== "PREPARED") throw new AppError("DUPLICATE_REQUEST", `Settlement session is already ${settlement.status}.`);
      if (!signingEnabledFor(settlement.network)) throw new AppError("SIGNING_FAILED", `Signing on ${settlement.network} is not enabled.`, 403);
      const spec = (LIVE_NETWORKS as Record<string, { label: string }>)[settlement.network];
      const payload: VaultSignRequest = {
        intentId: settlement.id,
        submissionToken: context.signing.issueSubmission({ intentId: settlement.id, userId: claims.userId, expiresAt: settlement.expiresAt, transaction: settlement.transaction }),
        transaction: settlement.transaction,
        display: {
          recipient: settlement.invoice.merchant_wallet,
          amount: settlement.invoice.breakdown.gross_amount,
          token: settlement.invoice.asset,
          network: settlement.network,
          networkLabel: spec?.label ?? settlement.network
        },
        expiresAt: settlement.expiresAt
      };
      context.analytics.record("signing_request_opened", "server", { userId: claims.userId, intentId: settlement.id, network: settlement.network, asset: settlement.invoice.asset, amount: settlement.invoice.breakdown.gross_amount, stage: `settlement:${settlement.stage}` });
      res.status(200).set("cache-control", "no-store").json(payload);
      return;
    }

    const intent = context.payments.intentForSigning(claims.userId, claims.intentId);
    if (!signingEnabledFor(intent.network)) throw new AppError("SIGNING_FAILED", `Signing on ${intent.network} is not enabled.`, 403);
    if (!context.adapter.buildTransferTransaction) throw new AppError("SIGNING_FAILED", "This deployment cannot build signing requests.", 501);
    const transaction = await context.adapter.buildTransferTransaction(claims.userId, intent);
    const spec = (LIVE_NETWORKS as Record<string, { label: string }>)[intent.network];
    const asset = paymentAssetSpec(intent.network, intent.token);
    const payload: VaultSignRequest = {
      intentId: intent.id,
      submissionToken: context.signing.issueSubmission({ intentId: intent.id, userId: claims.userId, expiresAt: intent.expiresAt, transaction }),
      transaction,
      display: { recipient: intent.recipient, amount: intent.amount, token: asset?.symbol ?? intent.token, network: intent.network, networkLabel: spec?.label ?? intent.network },
      expiresAt: intent.expiresAt
    };
    context.analytics.record("signing_request_opened", "server", { userId: claims.userId, intentId: intent.id, network: intent.network, asset: intent.token, amount: intent.amount });
    res.status(200).set("cache-control", "no-store").json(payload);
  } catch (error) {
    const safe = safeError(error);
    context.analytics.record("stage_error", "server", { stage: "sign_request", errorCode: safe.code });
    respondSigningError(res, error);
  }
});

app.post("/api/vault/submit-signed", rateLimit("submit-signed", 10, 10 * 60_000), express.json({ limit: "32kb", type: "application/json" }), async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const signedTransaction = typeof req.body?.signedTransaction === "string" ? req.body.signedTransaction : "";
    const claims = context.signing.verifySubmission(token);
    if (!claims) { res.status(410).set("cache-control", "no-store").json({ error: "SIGN_REQUEST_EXPIRED_OR_INVALID" }); return; }
    const settlement = context.settlementExecution.getSession(claims.userId, claims.intentId);
    const intent = settlement ? null : context.payments.intentForSigning(claims.userId, claims.intentId);
    const network = settlement?.network ?? intent!.network;
    if (!signingEnabledFor(network)) throw new AppError("SIGNING_FAILED", `Signing on ${network} is not enabled.`, 403);
    const connection = context.store.getWalletConnection(claims.userId);
    if (!connection) throw new AppError("WALLET_NOT_FOUND", "Connect your wallet before signing.", 404);

    if (claims.transaction.kind === "SOLANA") {
      if (network !== "SOLANA") throw new AppError("SIGNING_FAILED", "The signing payload does not match the intent network.");
      validateSignedSolanaTransaction(connection.addresses.solana, signedTransaction, claims.transaction);
    } else if (claims.transaction.kind === "NEAR") {
      if (network !== "NEAR") throw new AppError("SIGNING_FAILED", "The signing payload does not match the intent network.");
      validateSignedNearTransaction(connection.addresses.near, signedTransaction, claims.transaction);
    } else if (claims.transaction.kind === "APTOS") {
      if (network !== "APTOS") throw new AppError("SIGNING_FAILED", "The signing payload does not match the intent network.");
      validateSignedAptosTransaction(connection.addresses.aptos, signedTransaction, claims.transaction);
    } else if (claims.transaction.kind === "CASPER") {
      if (network !== "CASPER") throw new AppError("SIGNING_FAILED", "The signing payload does not match the intent network.");
      validateSignedCasperTransaction(connection.addresses.casper, signedTransaction, claims.transaction);
    } else {
      if (["SOLANA", "NEAR", "APTOS", "CASPER"].includes(network)) throw new AppError("SIGNING_FAILED", "The signing payload does not match the intent network.");
      if (!/^0x[0-9a-fA-F]{2,}$/.test(signedTransaction)) throw new AppError("SIGNING_FAILED", "Signed transaction is missing or malformed.");
      await validateSignedEvmTransaction(connection.addresses.evm, signedTransaction, claims.transaction);
    }

    context.analytics.record("transaction_signed", "server", settlement
      ? { userId: claims.userId, intentId: settlement.id, network, asset: settlement.invoice.asset, amount: settlement.invoice.breakdown.gross_amount, stage: `settlement:${settlement.stage}` }
      : { userId: claims.userId, intentId: intent!.id, network, asset: intent!.token, amount: intent!.amount });

    if (!context.adapter.broadcastRawTransaction) throw new AppError("SIGNING_FAILED", "This deployment cannot broadcast transactions.", 501);
    const execution = await context.adapter.broadcastRawTransaction(network, signedTransaction);
    if (settlement) {
      const session = context.settlementExecution.finalizeBroadcast(claims.userId, settlement.id, execution);
      res.status(200).set("cache-control", "no-store").json({ transactionHash: execution.transactionHash, explorerUrl: session.explorerUrl, status: session.status, settlementSessionId: session.id, stage: session.stage });
      return;
    }
    const result = context.payments.finalizeVaultBroadcast(claims.userId, claims.intentId, execution);
    res.status(200).set("cache-control", "no-store").json({ transactionHash: execution.transactionHash, explorerUrl: result.explorerUrl, status: result.intent.status });
  } catch (error) {
    const safe = safeError(error);
    context.analytics.record("stage_error", "server", { stage: "submit_signed", errorCode: safe.code });
    respondSigningError(res, error);
  }
});

// Internal analytics dashboard. Enabled only when ANALYTICS_DASHBOARD_TOKEN is
// set; authenticated by that token; renders aggregates only — no addresses, no
// user identifiers, nothing reversible.
function dashboardAuthorized(req: Request): boolean {
  const token = config.analyticsDashboardToken;
  if (!token) return false;
  const provided = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "")
    || (typeof req.query.token === "string" ? req.query.token : "");
  if (provided.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(token));
}

app.get("/internal/analytics.json", rateLimit("analytics", 60, 60_000), (req, res) => {
  if (!dashboardAuthorized(req)) { res.status(404).type("text/plain").send("Not Found"); return; }
  res.status(200).set("cache-control", "no-store").json({
    ...context.analytics.summary(),
    casperCommunity: context.analytics.communitySlice()
  });
});

app.get("/internal/analytics", rateLimit("analytics", 60, 60_000), (req, res) => {
  if (!dashboardAuthorized(req)) { res.status(404).type("text/plain").send("Not Found"); return; }
  const summary = context.analytics.summary() as Record<string, any>;
  const community = context.analytics.communitySlice() as Record<string, any>;
  const section = (title: string, value: unknown): string =>
    `<section><h2>${title}</h2><pre>${JSON.stringify(value, null, 2)}</pre></section>`;
  const totals = summary.totals as Record<string, number>;
  const active = summary.activeUsers as Record<string, number>;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AiFinPay Wallet Analytics</title><style>
    body{font-family:-apple-system,Helvetica,sans-serif;background:#111;color:#eee;max-width:960px;margin:24px auto;padding:0 16px}
    h1{font-size:20px;border-bottom:2px solid #4880CF;padding-bottom:8px} h2{font-size:14px;color:#7ab0f5;margin:18px 0 6px}
    pre{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:8px;padding:12px;overflow-x:auto;font-size:12px}
    .cards{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
    .card{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:10px;padding:12px 16px;min-width:130px}
    .card b{display:block;font-size:22px;color:#fff} .card span{font-size:11px;color:#999}
  </style></head><body><h1>AiFinPay GPT Wallet — internal analytics</h1>
  <p style="color:#888;font-size:12px">Generated ${summary.generatedAt}. Server-side events are authoritative; UI events are directional only. No addresses or user identifiers are stored or shown.</p>
  <div class="cards">
    <div class="card"><b>${totals.connectedVaults}</b><span>connected Vaults</span></div>
    <div class="card"><b>${totals.uniqueUsers}</b><span>unique users</span></div>
    <div class="card"><b>${active.daily}</b><span>daily active</span></div>
    <div class="card"><b>${active.weekly}</b><span>weekly active</span></div>
    <div class="card"><b>${Math.round((totals.walletOpenToCompletedConversion ?? 0) * 100)}%</b><span>open → completed tx</span></div>
  </div>
  ${section("Transfers by status (authoritative, from payment intents)", summary.transfers)}
  ${section("Funnel — events, last 30 days", summary.funnel30d)}
  ${section("Daily active users, last 14 days", summary.dailyActive14d)}
  ${section("Platforms (UI events, distinct users, 30d)", summary.byPlatform30d)}
  ${section("Widget versions seen (30d)", summary.byWidgetVersion30d)}
  ${section("Network selections (30d)", summary.networkSelections30d)}
  ${section("Errors by stage (30d)", summary.errors30d)}
  ${section("Referrals (first touch)", summary.referrals)}
  ${section("Casper community test results", community)}
  </body></html>`;
  res.status(200).set({
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "x-robots-tag": "noindex", "x-content-type-options": "nosniff", "x-frame-options": "DENY"
  }).send(html);
});

app.all("/mcp", rateLimit("mcp", 180, 60_000), async (req: Request & { auth?: AuthInfo }, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  const startedAt = Date.now();
  res.on("finish", () => console.log(JSON.stringify({
    level: "info", event: "MCP_REQUEST", method: req.method,
    authenticated: Boolean(req.headers.authorization),
    status: res.statusCode, ms: Date.now() - startedAt
  })));
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    try { req.auth = await context.oauth.verifyAccessToken(authorization.slice(7)); }
    catch { req.auth = undefined; }
  }
  const server = createMcpServer(context);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch {
    console.error(JSON.stringify({ level: "error", requestId: req.headers["x-request-id"] ?? "n/a", path: req.path, error: "MCP_REQUEST_FAILED" }));
    if (!res.headersSent) res.status(500).send("Internal server error");
  }
});

app.use((_req, res) => res.status(404).type("text/plain").send("Not Found"));

context.analytics.pruneOldEvents();
const analyticsPruneTimer = setInterval(() => context.analytics.pruneOldEvents(), 24 * 60 * 60 * 1000);
analyticsPruneTimer.unref();

const httpServer = createServer(app);
httpServer.listen(config.port, () => console.log(JSON.stringify({
  level: "info",
  message: "AiFinPay MCP server started",
  mcp: config.publicUrl,
  preview: `${config.widgetDomain}/preview`,
  demoMode: config.demoMode,
  signingNetworks: config.signingNetworks,
  authentication: "oauth-2.1-pkce"
})));

function shutdown(): void {
  httpServer.close(() => { context.close(); process.exit(0); });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);