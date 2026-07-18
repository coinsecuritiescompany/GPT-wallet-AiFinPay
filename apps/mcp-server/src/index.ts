import { createServer, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { AppContext } from "./context.js";
import { landingPage, privacyPage, supportPage } from "./public-pages.js";
import { createMcpServer, widgetHtml } from "./server.js";

const config = loadConfig();
const context = new AppContext(config);
const startedAt = Date.now();

const mcpMethods = new Set(["POST", "GET", "DELETE"]);

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  }).end(html);
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
      database: "ok",
      blockchainAdapter: context.adapter.kind
    }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    sendHtml(res, landingPage(config.publicUrl));
    return;
  }

  if (req.method === "GET" && url.pathname === "/preview") {
    sendHtml(res, widgetHtml());
    return;
  }

  if (req.method === "GET" && url.pathname === "/privacy") {
    sendHtml(res, privacyPage());
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
