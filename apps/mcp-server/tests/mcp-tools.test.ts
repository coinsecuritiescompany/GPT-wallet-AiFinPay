import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AppContext } from "../src/context.js";
import { createMcpServer } from "../src/server.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = { port: 0, demoMode: true, databaseUrl: ":memory:", sessionSecret: "test-session-secret-at-least-thirty-two-chars", publicUrl: "http://localhost/mcp", widgetDomain: "http://localhost", logLevel: "silent", walletMode: "demo", polygonRpcUrls: ["https://polygon.example"] };

describe("MCP tool registration", () => {
  const contexts: AppContext[] = [];
  afterEach(() => contexts.splice(0).forEach((ctx) => ctx.close()));

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
    expect(names).toEqual(expect.arrayContaining(["list_supported_mainnets", "create_wallet_pairing", "get_wallet_connection", "get_wallet_summary", "prepare_transfer", "confirm_transfer", "create_agent_policy", "evaluate_payment_request", "render_wallet"]));
    expect(names).toHaveLength(19);
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean)
      });
    }
    for (const name of ["confirm_transfer", "cancel_transfer", "revoke_agent_policy"]) {
      expect(tools.tools.find((tool) => tool.name === name)?.annotations).toMatchObject({ destructiveHint: true, openWorldHint: false });
    }
    expect(tools.tools.find((tool) => tool.name === "render_wallet")?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    // Opening/viewing the wallet must never require the wallet:write tier — a
    // write requirement here causes ChatGPT's "needs more access" reconnect loop.
    const openTool = (name: string) => tools.tools.find((tool) => tool.name === name);
    for (const name of ["create_wallet_pairing", "get_wallet_connection", "get_wallet_summary", "render_wallet", "list_transactions", "list_agent_policies", "get_audit_log"]) {
      expect(openTool(name)?.annotations).toMatchObject({ readOnlyHint: true });
      expect(openTool(name)?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:read"] }]);
    }
    for (const name of ["prepare_transfer", "confirm_transfer", "create_agent_policy", "update_agent_policy", "revoke_agent_policy"]) {
      expect(openTool(name)?._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["wallet:write"] }]);
    }
    const result = await client.callTool({ name: "get_wallet_summary", arguments: {} });
    expect((result.structuredContent as any).summary.balances[0].formatted).toBe("2543.68");
    await client.close(); await server.close();
  });

  it("opens the connected wallet directly instead of creating another pairing", async () => {
    const ctx = new AppContext(config); contexts.push(ctx);
    ctx.store.createWalletPairing("pairing-hash", "demo-user-001", new Date(Date.now() + 60_000).toISOString());
    expect(ctx.store.completeWalletPairing("pairing-hash", { evm: "0x1111111111111111111111111111111111111111", solana: "solana-address", near: "near-address", aptos: "aptos-address" })).toBe("connected");
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
    expect(result._meta?.["mcp/www_authenticate"]).toEqual([
      expect.stringContaining("/.well-known/oauth-protected-resource/mcp")
    ]);
    expect(result.structuredContent).toMatchObject({ view: "error", error: { code: "AUTH_REQUIRED" } });
    await client.close(); await server.close();
  });
});
