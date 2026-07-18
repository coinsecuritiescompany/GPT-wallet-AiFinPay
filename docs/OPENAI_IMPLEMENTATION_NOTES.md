# OpenAI implementation notes

Checked on 2026-07-18 against current official OpenAI documentation.

## Archetype

Primary archetype: **submission-ready React widget ChatGPT App**.

Architecture: TypeScript MCP server, React widget, decoupled data/render tools, remote `/mcp`, adapter boundary, deterministic demo ledger.

## Upstream starting point

The implementation adapts the official Apps SDK Node quickstart because it is the smallest current source-of-truth example for:

- `McpServer` plus stateless `StreamableHTTPServerTransport`;
- `registerAppResource` / `registerAppTool`;
- `RESOURCE_MIME_TYPE`;
- MCP Apps `ui/initialize`, `ui/notifications/initialized`, `ui/notifications/tool-result` and `tools/call` bridge messages;
- local `/mcp`, CORS and MCP Inspector setup.

The React component structure follows the official React guidance while bundling to one HTML file, avoiding relative asset failures inside the sandboxed widget iframe.

## Official references

- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [Examples](https://developers.openai.com/apps-sdk/build/examples)
- [Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference)
- [MCP Apps compatibility in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt)
- [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy)
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [Prepare an app for submission](https://developers.openai.com/apps-sdk/deploy/submission)
- [App guidelines](https://developers.openai.com/apps-sdk/app-guidelines)

## Current conventions applied

- Widget MIME type comes from `RESOURCE_MIME_TYPE`.
- Versioned URI: `ui://aifinpay/wallet-v1.html`.
- New standard `_meta.ui.resourceUri`, `_meta.ui.csp`, `_meta.ui.domain` and `_meta.ui.prefersBorder` fields are primary.
- ChatGPT compatibility aliases are included where useful.
- Exact empty CSP connect/resource allowlists are used because the single-file widget makes no direct network requests.
- `redirect_domains` permits only Polygon Amoy explorer links.
- Data tools and render tools have distinct jobs.
- Tool descriptions begin with model-selection guidance.
- Tool annotations declare read-only, destructive, open-world and idempotent behavior.
- Business data remains server-owned; widget state is ephemeral.

## Authentication choice

Demo mode resolves a fixed server-side demo session and never accepts user/wallet IDs from the model. Production mode fails with `AUTH_REQUIRED`. OAuth 2.1 account linking and per-tool scopes must be implemented before production, following the current authentication guide.

