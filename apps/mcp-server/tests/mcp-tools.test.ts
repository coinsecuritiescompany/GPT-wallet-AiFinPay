import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { AppContext } from "../src/context.js";
import { createMcpServer } from "../src/server.js";
import { LEGACY_WIDGET_URIS, WIDGET_URI } from "../src/tools/register-tools.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = {
  port: 0,
  demoMode: true,
  databaseUrl: ":memory:",
  sessionSecret: "test-session-secret-at-least-thirty-two-chars",
  publicUrl: "http://localhost/mcp",
  widgetDomain: "http://localhost",
  logLevel: "silent",
  walletMode: "demo",
  polygonRpcUrls: ["https://polygon.example"],
  mainnetRpcUrls: {},
  mainnetRpcAuth: {},
  signingNetworks: [],
  settlementApiOrigin: "https://api.aifinpay.io"
};

const nativeTools = ["prepare_solana_transfer", "prepare_near_transfer", "prepare_aptos_transfer", "prepare_casper_transfer"];
const settlementTools = [
  "list_aifinpay_settlement_routes", "prepare_aifinpay_settlement",
  "prepare_aifinpay_settlement_for_vault", "get_aifinpay_settlement_status",
  "quote_aifinpay_settlement_swap"
];

describe("MCP tool registration", () => {
  const contexts: AppContext[] = [];
  afterEach(() => {
    contexts.splice(0).forEach((ctx) => ctx.close());
    vi.unstubAllGlobals();
  });

  it("registers all required tools and serves wallet summary", async () => {
    const ctx = new AppContext(config); contexts.push(ctx); const server = createMcpServer(ctx);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    expect(client.getServerVersion()).toMatchObject({
      name: "aifinpay-wallet",
      title: "AiFinPay Wallet",
      icons: [{ src: "http://localhost/icon.png", mimeType: "image/png", sizes: ["256x256"] }]
    });
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      "list_supported_mainnets", "open_wallet", "open_wallet_current", "create_wallet_pairing",
      "get_wallet_connection", "get_wallet_summary", "prepare_transfer", ...nativeTools, "confirm_transfer",
      "list_swap_assets", "get_swap_quote", "create_swap_order", "get_swap_status", "create_agent_policy",
      "evaluate_payment_request", "render_wallet", "track_ui_event", ...settlementTools
    ]));
    expect(names).toHaveLength(35);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean)
      });
      expect(tool.outputSchema).toMatchObject({
        type: "object",
        properties: { view: { type: "string" } },
        required: ["view"]
      });
    }
    for (const name of ["confirm_transfer", "cancel_transfer", "revoke_agent_policy"]) {
      expect(tools.tools.find((tool) => tool.name === name)?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: false });
    }
    expect(tools.tools.find((tool) => tool.name === "render_wallet")?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    const openTool = (name: string) => tools.tools.find((tool) => tool.name === name);
    for (const name of ["open_wallet", "create_wallet_pairing", "get_wallet_connection", "get_wallet_summary", "render_wallet", "list_transactions", "list_agent_policies", "get_audit_log"]) {
      expect(openTool(name)?.annotations).toMatchObject({ readOnlyHint: true });
      expect(openTool(name)?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    }
    for (const name of ["open_wallet", "create_wallet_pairing", "render_wallet", "create_agent_policy", ...nativeTools]) {
      expect(openTool(name)?._meta?.ui).toMatchObject({ resourceUri: WIDGET_URI });
      expect(openTool(name)?._meta?.["openai/outputTemplate"]).toBe(WIDGET_URI);
    }
    expect(openTool("create_wallet_pairing")?._meta?.ui).toEqual({ resourceUri: WIDGET_URI, visibility: ["app"] });
    for (const name of ["prepare_transfer", ...nativeTools, "confirm_transfer", "create_agent_policy", "update_agent_policy", "revoke_agent_policy", "prepare_aifinpay_settlement_for_vault"]) {
      expect(openTool(name)?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:write"] }]);
    }
    expect(openTool("create_swap_order")?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:write"] }]);
    expect(openTool("create_swap_order")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: true });
    expect(openTool("list_aifinpay_settlement_routes")?._meta?.securitySchemes).toEqual([{ type: "noauth" }]);
    expect(openTool("prepare_aifinpay_settlement")?._meta?.securitySchemes).toEqual([{ type: "noauth" }]);
    expect(openTool("get_aifinpay_settlement_status")?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    expect(openTool("quote_aifinpay_settlement_swap")?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    const resource = await client.readResource({ uri: WIDGET_URI });
    expect(resource.contents[0]).toMatchObject({
      uri: WIDGET_URI,
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: { prefersBorder: true },
        "openai/widgetPrefersBorder": true
      }
    });
    expect(resource.contents[0]?.text).toContain("<!doctype html>");
    for (const legacyUri of LEGACY_WIDGET_URIS) {
      const legacyResource = await client.readResource({ uri: legacyUri });
      expect(legacyResource.contents[0]).toMatchObject({ uri: legacyUri, mimeType: RESOURCE_MIME_TYPE });
      expect(legacyResource.contents[0]?.text).toContain("<!doctype html>");
    }
    const result = await client.callTool({ name: "get_wallet_summary", arguments: {} });
    expect((result.structuredContent as any).summary.balances[0].formatted).toBe("2543.68");
    await client.close(); await server.close();
  });

  it("opens the connected wallet directly instead of creating another pairing", async () => {
    const ctx = new AppContext(config); contexts.push(ctx);
    ctx.store.createWalletPairing("pairing-hash", "demo-user-001", new Date(Date.now() + 60_000).toISOString());
    expect(ctx.store.completeWalletPairing("pairing-hash", { evm: "0x1111111111111111111111111111111111111111", solana: "solana-address", near: "near-address", aptos: "aptos-address", casper: "casper-address" })).toBe("connected");
    const server = createMcpServer(ctx);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "create_wallet_pairing", arguments: {} });
    expect(result.structuredContent).toMatchObject({ view: "wallet", connection: { addresses: { evm: "0x1111111111111111111111111111111111111111" } } });
    expect((result.structuredContent as any).pairingUrl).toBeUndefined();
    await client.close(); await server.close();
  });

  it("challenges unauthenticated production users with OAuth instead of a shared demo wallet", async () => {
    const ctx = new AppContext({ ...config, demoMode: false }); contexts.push(ctx);
    const server = createMcpServer(ctx);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "render_wallet", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([expect.stringContaining("/.well-known/oauth-protected-resource/mcp")]);
    expect(result.structuredContent).toMatchObject({ view: "error", error: { code: "AUTH_REQUIRED" } });
    await client.close(); await server.close();
  });

  it("opens Casper first and keeps Receive available when its keyed RPC is not configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("RPC unavailable")));
    const ctx = new AppContext({ ...config, walletMode: "mainnet" }); contexts.push(ctx);
    ctx.store.upsertWalletConnection("demo-user-001", {
      evm: "0x1111111111111111111111111111111111111111",
      solana: "5L7xB9arfakeaddress111111111111111",
      near: "a".repeat(64),
      aptos: `0x${"b".repeat(64)}`,
      casper: `01${"c".repeat(64)}`
    });
    const server = createMcpServer(ctx);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "open_wallet", arguments: {} });
    expect(result.structuredContent).toMatchObject({
      view: "wallet",
      summary: { selectedNetwork: "CASPER", balances: [], balanceError: { code: "RPC_UNAVAILABLE" } },
      connection: { addresses: { casper: `01${"c".repeat(64)}` } }
    });
    await client.close(); await server.close();
  });
});
