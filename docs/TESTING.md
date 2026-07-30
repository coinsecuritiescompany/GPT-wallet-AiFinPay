# Testing strategy

## Automated gates

`npm run check` executes:

1. public-repository secret and artifact scan;
2. ESLint;
3. TypeScript checks across all workspaces;
4. unit, integration, widget and security regression tests;
5. production builds for shared packages, the compact widget, Vault and MCP server.

Run the dependency audit separately:

```bash
npm audit --audit-level=high --omit=dev
```

## Coverage areas

- base-unit amount parsing and formatting;
- policy evaluation and intent state transitions;
- idempotency and confirmation enforcement;
- cross-user ownership boundaries;
- audit-chain verification and tamper detection;
- public route and deployment configuration;
- Polygon RPC fallback, POL balance and native USDC `balanceOf` reads;
- mainnet send refusal;
- ChatGPT widget rendering and local Vault flows.
- bounded MCP Apps bridge initialization and compatibility fallback behavior;
- widget size-change notifications so ChatGPT can resize the iframe;
- custom overlay scrollbar visibility and scrolling independent of native mobile scrollbar support;
- full current-network label at narrow widths.

## Manual release checks

- Open the widget on desktop and mobile ChatGPT.
- On a physical mobile device, verify the full current network name is visible on the dashboard.
- Open the network selector and independently test finger scrolling, dragging/tapping the blue right-side track, and the ▲/▼ buttons.
- Leave the service idle long enough to measure a real cold open, then repeat while warm; record both timings.
- Simulate or interrupt the `ui/initialize` handshake and confirm the wallet shows a retryable error or uses the compatibility tool call instead of spinning forever.
- Verify the service reports `walletMode: mainnet` and `blockchainAdapter: MAINNET`.
- Pair a disposable Vault and confirm only public addresses reach the server.
- Compare POL/USDC balances with an independent Polygon explorer.
- Confirm Send displays the mainnet-signing safety gate.
- Test privacy, terms, support and health routes.
- Refresh/reconnect the ChatGPT app after a widget URI change.

Never use production credentials or funded wallets in public tests.
