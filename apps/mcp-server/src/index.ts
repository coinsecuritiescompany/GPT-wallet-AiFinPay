import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { AppContext } from "./context.js";
import { createMcpServer } from "./server.js";

const config = loadConfig();
const context = new AppContext(config);
const startedAt = Date.now();

const httpServer = createServer(async (req, res) => {
  if (!req.url) { res.writeHead(400).end("Missing URL"); return; }
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname === "/mcp") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id, authorization", "Access-Control-Expose-Headers": "Mcp-Session-Id"
    }).end(); return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      status: "ok", version: "0.1.0", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      demoMode: config.demoMode, database: "ok", blockchainAdapter: context.adapter.kind
    })); return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("AiFinPay Wallet MCP server — demo/testnet only"); return;
  }
  if (url.pathname === "/mcp" && req.method && new Set(["POST", "GET", "DELETE"]).has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    const server = createMcpServer(context);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res); }
    catch { console.error(JSON.stringify({ level: "error", requestId: req.headers["x-request-id"] ?? "n/a", path: url.pathname, error: "MCP_REQUEST_FAILED" })); if (!res.headersSent) res.writeHead(500).end("Internal server error"); }
    return;
  }
  res.writeHead(404).end("Not Found");
});

httpServer.listen(config.port, () => console.log(JSON.stringify({ level: "info", message: "AiFinPay MCP server started", mcp: `http://localhost:${config.port}/mcp`, demoMode: config.demoMode })));

function shutdown(): void { httpServer.close(() => { context.close(); process.exit(0); }); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
