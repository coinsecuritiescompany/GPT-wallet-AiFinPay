# OpenAI implementation notes

Checked on July 18, 2026 against current Apps SDK submission guidance.

## Archetype

**Submission-ready React widget ChatGPT App** with a TypeScript MCP server, decoupled data/render tools, versioned UI resource and external non-custodial Vault.

## Current conventions

- Remote universal MCP endpoint over HTTPS.
- `RESOURCE_MIME_TYPE` for the MCP App resource.
- Versioned widget URI: `ui://aifinpay/wallet-v3.html`.
- Standard `_meta.ui.resourceUri`, exact CSP metadata and ChatGPT compatibility aliases.
- One job per tool with model-selection descriptions.
- Explicit read-only, destructive, open-world and idempotent annotations.
- Concise model-visible content and structured widget data.
- Private keys/recovery words excluded from all MCP schemas and results.
- Public privacy, terms, support, health and product URLs.

## Submission readiness

Implemented: stable public MCP server, branded widget, public logo, narrow CSP, tool annotations, test prompts, legal URLs and organization-owned repository.

Still required from the owner/reviewer flow: verified OpenAI organization/business identity, submission permissions, tool scan, final screenshots/localization, YouTube demo and the Devpost Codex Session ID.

Every current tool omits `outputSchema`. This is not a runtime blocker but should be addressed before final public plugin review.

## Official references

- [Build an MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Build the ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [Define tools](https://developers.openai.com/apps-sdk/plan/tools)
- [Apps SDK reference](https://developers.openai.com/apps-sdk/reference)
- [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy)
- [Prepare an app for plugin submission](https://developers.openai.com/apps-sdk/deploy/submission)
- [App guidelines](https://developers.openai.com/apps-sdk/app-guidelines)
