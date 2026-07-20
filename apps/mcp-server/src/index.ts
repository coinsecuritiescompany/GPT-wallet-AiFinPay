import { createHash } from "node:crypto";
import { createServer } from "node:http";
import express, { type Request, type Response } from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AppError, LIVE_NETWORKS, safeError, type VaultSignRequest } from "@aifinpay/shared";
import { loadConfig } from "./config.js";
import { AppContext } from "./context.js";
import type { PublicWalletAddresses } from "./auth/oauth-provider.js";
import { landingPage, privacyPage, supportPage, termsPage } from "./public-pages.js";
import { appIconPng, createMcpServer, vaultHtml, widgetHtml } from "./server.js";
import { WIDGET_URI } from "./tools/register-tools.js";

const config = loadConfig();
const context = new AppContext(config);
const startedAt = Date.now();
const app = express();
const issuerUrl = new URL(config.widgetDomain.replace(/\/$/, "") + "/");
const resourceUrl = new URL(config.publicUrl);

app.disable("x-powered-by");

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
  if (!/^0x[a-fA-F0-9]{40}$/.test(evm) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solana) || !/^[a-f0-9]{64}$/.test(near) || !/^0x[a-f0-9]{64}$/.test(aptos)) return null;
  return { evm, solana, near, aptos };
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
    version: "0.2.0",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    demoMode: config.demoMode,
    walletMode: config.walletMode,
    authentication: "oauth-2.1-pkce",
    tokenData: "public-addresses-only",
    database: "ok",
    blockchainAdapter: context.adapter.kind,
    widgetResource: WIDGET_URI,
    release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? "local"
  });
});

app.get("/icon.png", (_req, res) => {
  const icon = appIconPng();
  if (!icon) { res.status(404).send("Icon not found"); return; }
  res.status(200).set({ "content-type": "image/png", "content-length": String(icon.byteLength), "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" }).send(icon);
});

app.get("/", (_req, res) => sendHtml(res, landingPage(config.publicUrl)));
app.get("/preview", (_req, res) => sendHtml(res, widgetHtml()));
app.get("/vault", (_req, res) => sendHtml(res, vaultHtml(), true));
app.get("/privacy", (_req, res) => sendHtml(res, privacyPage()));
app.get("/terms", (_req, res) => sendHtml(res, termsPage()));
app.get("/support", (_req, res) => sendHtml(res, supportPage()));

app.post("/api/oauth/approve", express.json({ limit: "16kb", type: "application/json" }), (req, res) => {
  try {
    const request = typeof req.body?.request === "string" ? req.body.request : "";
    const addresses = validAddresses(req.body?.addresses);
    if (!request.startsWith("afp1.authorize.") || !addresses) { res.status(400).json({ error: "INVALID_AUTHORIZATION_APPROVAL" }); return; }
    res.status(200).set("cache-control", "no-store").json({ redirectUrl: context.oauth.approveAuthorization(request, addresses) });
  } catch {
    res.status(410).set("cache-control", "no-store").json({ error: "AUTHORIZATION_EXPIRED_OR_INVALID" });
  }
});

// Kept temporarily so an already-open v7 Vault page fails safely instead of uploading secrets.
app.post("/api/vault/pair", express.json({ limit: "16kb", type: "application/json" }), (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const addresses = validAddresses(req.body?.addresses);
  if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !addresses) { res.status(400).json({ error: "INVALID_PAIRING_REQUEST" }); return; }
  const result = context.store.completeWalletPairing(createHash("sha256").update(token).digest("hex"), addresses);
  res.status(result === "invalid" ? 410 : 200).json(result === "invalid" ? { error: "PAIRING_EXPIRED_OR_UNKNOWN" } : { connected: true, alreadyConnected: result === "already_connected" });
});

// --- Non-custodial signing handoff -----------------------------------------
// The Vault (separate origin, holds the on-device key) calls these two routes.
// The server never receives a private key: it hands out an unsigned transaction
// built from the stored intent, and later broadcasts the raw signed tx the
// Vault returns. Both are gated on the intent's network being switched on via
// AIFINPAY_SIGNING_NETWORKS, so with signing off they can never move funds.
function signingEnabledFor(network: string): boolean {
  return config.walletMode === "mainnet" && (config.signingNetworks as string[]).includes(network);
}

function respondSigningError(res: Response, error: unknown): void {
  const safe = safeError(error);
  const status = error instanceof AppError ? error.status : 500;
  res.status(status).set("cache-control", "no-store").json({ error: safe.code, message: safe.message });
}

app.post("/api/vault/sign-request", express.json({ limit: "16kb", type: "application/json" }), async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const claims = context.signing.verify(token);
    if (!claims) { res.status(410).set("cache-control", "no-store").json({ error: "SIGN_REQUEST_EXPIRED_OR_INVALID" }); return; }
    const intent = context.payments.intentForSigning(claims.userId, claims.intentId);
    if (!signingEnabledFor(intent.network)) throw new AppError("SIGNING_FAILED", `Signing on ${intent.network} is not enabled.`, 403);
    if (!context.adapter.buildTransferTransaction) throw new AppError("SIGNING_FAILED", "This deployment cannot build signing requests.", 501);
    const transaction = await context.adapter.buildTransferTransaction(claims.userId, intent);
    const spec = (LIVE_NETWORKS as Record<string, { label: string }>)[intent.network];
    const payload: VaultSignRequest = {
      intentId: intent.id,
      transaction,
      display: { recipient: intent.recipient, amount: intent.amount, token: intent.token, network: intent.network, networkLabel: spec?.label ?? intent.network },
      expiresAt: intent.expiresAt
    };
    res.status(200).set("cache-control", "no-store").json(payload);
  } catch (error) { respondSigningError(res, error); }
});

app.post("/api/vault/submit-signed", express.json({ limit: "16kb", type: "application/json" }), async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const signedTransaction = typeof req.body?.signedTransaction === "string" ? req.body.signedTransaction : "";
    const claims = context.signing.verify(token);
    if (!claims) { res.status(410).set("cache-control", "no-store").json({ error: "SIGN_REQUEST_EXPIRED_OR_INVALID" }); return; }
    if (!/^0x[0-9a-fA-F]{2,}$/.test(signedTransaction)) throw new AppError("SIGNING_FAILED", "Signed transaction is missing or malformed.");
    const intent = context.payments.intentForSigning(claims.userId, claims.intentId);
    if (!signingEnabledFor(intent.network)) throw new AppError("SIGNING_FAILED", `Signing on ${intent.network} is not enabled.`, 403);
    if (!context.adapter.broadcastRawTransaction) throw new AppError("SIGNING_FAILED", "This deployment cannot broadcast transactions.", 501);
    const execution = await context.adapter.broadcastRawTransaction(intent.network, signedTransaction);
    const result = context.payments.finalizeVaultBroadcast(claims.userId, claims.intentId, execution);
    res.status(200).set("cache-control", "no-store").json({ transactionHash: execution.transactionHash, explorerUrl: result.explorerUrl, status: result.intent.status });
  } catch (error) { respondSigningError(res, error); }
});

app.all("/mcp", async (req: Request & { auth?: AuthInfo }, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
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

const httpServer = createServer(app);
httpServer.listen(config.port, () => console.log(JSON.stringify({
  level: "info",
  message: "AiFinPay MCP server started",
  mcp: config.publicUrl,
  preview: `${config.widgetDomain}/preview`,
  demoMode: config.demoMode,
  authentication: "oauth-2.1-pkce"
})));

function shutdown(): void {
  httpServer.close(() => { context.close(); process.exit(0); });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
