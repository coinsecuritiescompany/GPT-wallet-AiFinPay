import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MAINNET_NETWORKS } from "@aifinpay/shared";
import type { AppContext } from "./context.js";
import { registerSettlementTools } from "./tools/register-settlement-tools.js";
import { registerSolanaTools } from "./tools/register-solana-tools.js";
import { LEGACY_WIDGET_URIS, registerTools, WIDGET_URI } from "./tools/register-tools.js";

export function widgetHtml(): string {
  const candidates = [
    resolve(process.cwd(), "apps/wallet-widget/dist/index.html"),
    resolve(fileURLToPath(new URL("../../wallet-widget/dist/index.html", import.meta.url)))
  ];
  const path = candidates.find(existsSync);
  return path ? readFileSync(path, "utf8") : "<!doctype html><html><body><main>Build the wallet widget before starting the MCP server.</main></body></html>";
}

export function vaultHtml(): string {
  const candidates = [
    resolve(process.cwd(), "apps/wallet-widget/dist-vault/vault.html"),
    resolve(fileURLToPath(new URL("../../wallet-widget/dist-vault/vault.html", import.meta.url)))
  ];
  const path = candidates.find(existsSync);
  return path ? readFileSync(path, "utf8") : "<!doctype html><html><body><main>Build the secure Vault before starting the MCP server.</main></body></html>";
}

export function appIconPng(): Buffer | undefined {
  const candidates = [
    resolve(process.cwd(), "apps/mcp-server/assets/aifinpay-logo.png"),
    resolve(fileURLToPath(new URL("../assets/aifinpay-logo.png", import.meta.url)))
  ];
  const path = candidates.find(existsSync);
  return path ? readFileSync(path) : undefined;
}

export function createMcpServer(ctx: AppContext): McpServer {
  const appOrigin = ctx.config.widgetDomain.replace(/\/$/, "");
  const explorerOrigins = [...new Set(Object.values(MAINNET_NETWORKS).map((network) => new URL(network.explorerBaseUrl).origin))];
  const server = new McpServer({
    name: "aifinpay-wallet",
    title: "AiFinPay Wallet",
    version: "0.3.0",
    description: "Non-custodial AiFinPay wallet for live balances and receiving across 13 mainnets, canonical AIFP-1/AIFP-2 settlement discovery, per-network local signing, agent limits, and audit trails.",
    websiteUrl: appOrigin,
    icons: [{ src: `${appOrigin}/icon.png`, mimeType: "image/png", sizes: ["256x256"] }]
  }, {
    instructions: "Never request or expose private keys, recovery phrases, or Vault passwords. User-specific tools require OAuth 2.1 with PKCE and receive public wallet addresses only. Open authenticated users directly in the wallet dashboard. Balances are read from live mainnet RPCs. Canonical settlement invoices are read from the AiFinPay settlement API and never authorize value movement by themselves. Transfers are available only on networks explicitly marked signing-enabled and require review plus local Vault signing."
  });
  for (const [index, resourceUri] of [WIDGET_URI, ...LEGACY_WIDGET_URIS].entries()) {
    registerAppResource(server, `aifinpay-wallet-widget-${index}`, resourceUri, {}, async () => ({
      contents: [{
        uri: resourceUri,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml(),
        _meta: {
          ui: {
            prefersBorder: true,
            csp: { connectDomains: [], resourceDomains: [], redirectDomains: explorerOrigins },
            ...(ctx.config.widgetDomain.startsWith("https://") ? { domain: ctx.config.widgetDomain } : {})
          },
          "openai/widgetDescription": "Interactive non-custodial AiFinPay wallet showing live balances and receive addresses across 13 mainnets, canonical AIFP-1/AIFP-2 settlement readiness, and locally approved transfers on explicitly enabled networks.",
          "openai/widgetPrefersBorder": true,
          "openai/widgetCSP": { connect_domains: [], resource_domains: [], redirect_domains: [...explorerOrigins, "https://amoy.polygonscan.com"] }
        }
      }]
    }));
  }
  registerTools(server, ctx);
  registerSettlementTools(server, ctx);
  registerSolanaTools(server, ctx);
  return server;
}
