# OpenAI implementation notes

Checked on July 30, 2026 against current Apps SDK submission guidance.

## Archetype

**Submission-ready React widget ChatGPT App** with a TypeScript MCP server, decoupled data/render tools, versioned UI resource and external non-custodial Vault.

## Current conventions

- Remote universal MCP endpoint over HTTPS.
- `RESOURCE_MIME_TYPE` for the MCP App resource.
- Versioned widget URI: `ui://aifinpay/wallet-v14.html`, with compatibility aliases for previously registered resource URIs.
- Stable model-visible `open_wallet` tool; the temporary `open_wallet_current` descriptor remains app-only for v13 compatibility.
- Bounded MCP Apps bridge initialization with a ChatGPT compatibility fallback, so a mobile handshake failure cannot leave the wallet on an infinite spinner.
- OAuth 2.1 authorization-code flow with PKCE, protected-resource metadata, dynamic client registration and per-tool `wallet:read` security metadata.
- Standard `_meta.ui.resourceUri`, exact CSP metadata and ChatGPT compatibility aliases.
- One job per tool with model-selection descriptions.
- Explicit read-only, destructive, open-world and idempotent annotations.
- Concise model-visible content and structured widget data.
- Private keys/recovery words excluded from all MCP schemas and results.
- Public privacy, terms, support, health and product URLs.

## Submission readiness

Implemented: stable public MCP server, branded widget, public logo, narrow CSP, tool annotations, test prompts, legal URLs and organization-owned repository.

Still required from the owner/reviewer flow: verified OpenAI organization/business identity, submission permissions, tool scan, final screenshots/localization and reviewer test credentials/instructions where applicable.

Every tool declares a machine-checkable structured-content output envelope with a required `view` discriminator. MCP validates non-error results before returning them to ChatGPT.

## Official references

- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Build the ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference)
- [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy)
- [Prepare an app for plugin submission](https://developers.openai.com/apps-sdk/deploy/submission)
- [App guidelines](https://developers.openai.com/apps-sdk/app-guidelines)
