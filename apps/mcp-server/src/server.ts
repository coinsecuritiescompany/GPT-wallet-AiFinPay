import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppContext } from "./context.js";
import { registerTools, WIDGET_URI } from "./tools/register-tools.js";

export function widgetHtml(): string {
  const candidates = [
    resolve(process.cwd(), "apps/wallet-widget/dist/index.html"),
    resolve(fileURLToPath(new URL("../../../wallet-widget/dist/index.html", import.meta.url)))
  ];
  const path = candidates.find(existsSync);
  return path ? readFileSync(path, "utf8") : "<!doctype html><html><body><main>Build the wallet widget before starting the MCP server.</main></body></html>";
}

export function createMcpServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: "aifinpay-wallet", version: "0.1.0" }, {
    instructions: "AiFinPay Wallet is demo/testnet-only. Always prepare transfers before confirmation. Never request or expose private keys or seed phrases. The policy engine is authoritative for agent payments."
  });
  registerAppResource(server, "aifinpay-wallet-widget", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      text: widgetHtml(),
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [] },
          ...(ctx.config.widgetDomain.startsWith("https://") ? { domain: ctx.config.widgetDomain } : {})
        },
        "openai/widgetDescription": "Interactive AiFinPay demo wallet for balances, transfer approval, agent limits, history, and audit receipts.",
        "openai/widgetPrefersBorder": true,
        "openai/widgetCSP": { connect_domains: [], resource_domains: [], redirect_domains: ["https://amoy.polygonscan.com"] }
      }
    }]
  }));
  registerTools(server, ctx);
  return server;
}
