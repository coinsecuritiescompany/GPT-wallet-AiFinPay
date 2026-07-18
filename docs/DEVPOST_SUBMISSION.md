# Devpost submission draft

## Project name

AiFinPay Wallet for ChatGPT

## Tagline

Send, receive and approve agent payments without leaving the conversation.

## One-sentence description

AiFinPay Wallet for ChatGPT is a programmable wallet and approval layer that lets users and autonomous AI agents prepare, authorize and execute demo/testnet-shaped payments directly inside a ChatGPT conversation.

## Inspiration

Agents can buy data and call services, but giving them unrestricted payment credentials is unsafe. We wanted a conversational wallet where natural language creates an intent while deterministic code controls whether money may move.

## What it does

The app opens an interactive wallet inside ChatGPT, shows balances/history, prepares USDC transfers, requires explicit human confirmation, gives agents narrow spending policies, blocks violations and produces receipts with a tamper-evident audit trail.

## How it works

ChatGPT selects one-job MCP tools. A TypeScript server validates inputs, resolves the server-side session, evaluates policy, creates a payment intent and returns structured data. A React widget renders that result and calls confirmation tools through the MCP Apps bridge. The hackathon adapter uses a deterministic demo ledger for stable presentation.

## How GPT-5.6 is used

GPT-5.6 interprets natural-language wallet requests, selects MCP tools and explains deterministic results in plain language. GPT-5.6 never produces the authoritative payment decision and cannot bypass the policy engine.

## How Codex was used

Codex audited the empty repository, checked current official Apps SDK documentation, scaffolded the monorepo, implemented the server/widget/security layers, wrote tests, fixed failures, prepared Docker deployment and created submission documentation.

## OpenAI Apps SDK and MCP

The app exposes a remote `/mcp`, a versioned `text/html;profile=mcp-app` resource, 16 tools with accurate annotations and a React UI using the standard `ui/*` bridge. Current `_meta.ui` CSP/resource metadata and ChatGPT compatibility fields are included.

## Safety

No seed phrases or private keys exist in the product. Transfers use integer base units, explicit prepared intents, expiring confirmation tokens, ownership checks, idempotency, a state machine and deterministic policy rules. The demo is clearly labelled and never claims a real blockchain transaction.

## Challenges

Keeping the demo stable without weakening the production boundary; designing one-job tools; making confirmations retry-safe; and separating model explanation from policy authority.

## Accomplishments

A complete inline wallet flow, human and agent payment scenarios, blocked payments with exact reasons, 16 MCP tools, a single-file React widget, SQLite persistence, audit hash chain and automated tests.

## Built during Build Week

The repository was empty at baseline. All code, tests, documentation and container configuration in the first release were created during Build Week.

## What comes next

AiFinPay OAuth account linking, a user-controlled or MPC/HSM signer, real Polygon Amoy execution, managed Postgres, distributed idempotency, merchant identity and external security audit.

## Three-minute video

Use the timed script in `docs/DEMO_SCRIPT.md`.

## Submission placeholders

- Live app: `https://aifinpay-wallet-chatgpt.onrender.com/`
- MCP URL: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`
- Source: `https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`
- Demo video: `TBD`
- Privacy policy: `https://aifinpay-wallet-chatgpt.onrender.com/privacy`
- Support URL: `https://aifinpay-wallet-chatgpt.onrender.com/support`
