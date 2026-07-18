import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { AppContext } from "./context.js";
import { landingPage, privacyPage, supportPage, termsPage } from "./public-pages.js";
import { appIconPng, createMcpServer, vaultHtml, widgetHtml } from "./server.js";

const config = loadConfig();
const context = new AppContext(config);
const startedAt = Date.now();

const mcpMethods = new Set(["POST", "GET", "DELETE"]);

function sendHtml(res: ServerResponse, html: string, allowSelfConnect = false): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src ${allowSelfConnect ? "'self'" : "'none'"}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  }).end(html);
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += data.length; if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE"); chunks.push(data); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === "/mcp") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    }).end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }).end(JSON.stringify({
      status: "ok",
      version: "0.1.0",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      demoMode: config.demoMode,
      walletMode: config.walletMode,
      database: "ok",
      blockchainAdapter: context.adapter.kind
    }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/icon.png") {
    const icon = appIconPng();
    if (!icon) {
      res.writeHead(404).end("Icon not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "image/png",
      "content-length": icon.byteLength,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff"
    }).end(icon);
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    sendHtml(res, landingPage(config.publicUrl));
    return;
  }

  if (req.method === "GET" && (url.pathname === "/preview" || url.pathname === "/vault")) {
    sendHtml(res, url.pathname === "/vault" ? vaultHtml() : widgetHtml(), url.pathname === "/vault");
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/vault/pair") {
    try {
      const body = await readJson(req);
      const token = typeof body.token === "string" ? body.token : "";
      const addresses = body.addresses && typeof body.addresses === "object" && !Array.isArray(body.addresses) ? body.addresses as Record<string, unknown> : null;
      const evm = addresses && typeof addresses.evm === "string" ? addresses.evm : "";
      const solana = addresses && typeof addresses.solana === "string" ? addresses.solana : "";
      const near = addresses && typeof addresses.near === "string" ? addresses.near : "";
      const aptos = addresses && typeof addresses.aptos === "string" ? addresses.aptos : "";
      if (!/^[A-Za-z0-9_-]{32}$/.test(token) || !/^0x[a-fA-F0-9]{40}$/.test(evm) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(solana) || !/^[a-f0-9]{64}$/.test(near) || !/^0x[a-f0-9]{64}$/.test(aptos)) {
        sendJson(res, 400, { error: "INVALID_PAIRING_REQUEST" }); return;
      }
      const ok = context.store.completeWalletPairing(createHash("sha256").update(token).digest("hex"), { evm, solana, near, aptos });
      sendJson(res, ok ? 200 : 410, ok ? { connected: true } : { error: "PAIRING_EXPIRED_OR_USED" });
    } catch (error) {
      sendJson(res, error instanceof Error && error.message === "REQUEST_TOO_LARGE" ? 413 : 400, { error: "INVALID_JSON" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/privacy") {
    sendHtml(res, privacyPage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/terms") {
    sendHtml(res, termsPage());
    return;
  }

  if (req.method === "GET" && url.pathname === "/support") {
    sendHtml(res, supportPage());
    return;
  }

  if (url.pathname === "/mcp" && req.method && mcpMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createMcpServer(context);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      console.error(JSON.stringify({
        level: "error",
        requestId: req.headers["x-request-id"] ?? "n/a",
        path: url.pathname,
        error: "MCP_REQUEST_FAILED"
      }));
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not Found");
});

httpServer.listen(config.port, () => console.log(JSON.stringify({
  level: "info",
  message: "AiFinPay MCP server started",
  mcp: config.publicUrl,
  preview: `${config.widgetDomain}/preview`,
  demoMode: config.demoMode
})));

function shutdown(): void {
  httpServer.close(() => {
    context.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
