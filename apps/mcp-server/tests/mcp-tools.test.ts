import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AppContext } from "../src/context.js";
import { createMcpServer } from "../src/server.js";
import type { AppConfig } from "../src/config.js";

const config: AppConfig = { port: 0, demoMode: true, databaseUrl: ":memory:", sessionSecret: "test-session-secret-at-least-thirty-two-chars", publicUrl: "http://localhost/mcp", widgetDomain: "http://localhost", logLevel: "silent" };

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
    const result = await client.callTool({ name: "get_wallet_summary", arguments: {} });
    expect((result.structuredContent as any).summary.balances[0].formatted).toBe("2543.68");
    await client.close(); await server.close();
  });
});
