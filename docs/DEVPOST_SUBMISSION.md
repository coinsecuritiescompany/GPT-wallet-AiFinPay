# Devpost submission draft

## Project name

AiFinPay Wallet for ChatGPT

## Track

Apps for Your Life — personal finance

## Tagline

A non-custodial wallet interface built for conversations and AI agents.

## Inspiration

AI agents can call APIs and complete workflows, but payment authorization still relies on interfaces designed only for people or on dangerously broad signing credentials. We wanted a wallet that feels native to ChatGPT while keeping recovery and future signing authority with the user.

## What it does

AiFinPay opens a wallet interface inside ChatGPT, creates or restores a local encrypted Vault, pairs public addresses, reads live POL and native USDC balances from Polygon mainnet and presents Receive, network and policy views. Mainnet sending is intentionally blocked until per-user authentication and reviewed local signing are complete.

## How it works

GPT-5.6 interprets natural-language requests and selects a focused MCP tool. A TypeScript MCP server validates inputs and reads public chain state. A compact React widget renders the result inside ChatGPT. The separate browser Vault derives EVM, Solana, NEAR and Aptos addresses and encrypts recovery locally; the server receives public addresses only.

## How GPT-5.6 is used

GPT-5.6 is the conversational orchestration layer: it recognizes wallet intents, selects tools and explains structured results. It does not generate balances, determine authoritative policies or receive recovery words/private keys.

## How Codex was used

Codex audited the initial empty repository, researched Apps SDK requirements, created the TypeScript monorepo, implemented MCP tools and the React interface, added the local Vault and Polygon adapter, diagnosed mobile bundle size, split heavy cryptography from the widget, wrote and ran tests, deployed to Render and reconciled security/legal/submission documentation with actual behavior.

Human decisions included selecting non-custodial recovery, choosing Polygon as the first live chain, keeping mainnet sending disabled until safe authentication/signing exists and separating the public reference repository from the future private production implementation.

## Challenges

- Making wallet recovery available without exposing it to ChatGPT or the server.
- Keeping the inline mobile widget fast while supporting multi-chain derivation.
- Replacing demo balances with honest live mainnet reads.
- Designing tool annotations and state boundaries that accurately describe side effects.
- Presenting a compelling working product without pretending unfinished signing is production-ready.

## Accomplishments

- Non-custodial local 12/15-word Vault with encrypted browser storage.
- 12 derived address networks across EVM, Solana, NEAR and Aptos families.
- Live read-only Polygon POL and native USDC balances.
- 19 focused MCP tools and a versioned ChatGPT widget.
- Deterministic policy/state-machine reference layer and tamper-evident audit chain.
- Mobile widget reduced by separating the Vault bundle.
- Automated CI, security scan, tests, Docker/Render deployment and review documentation.

## What comes next

Personal OAuth, durable user-scoped storage, indexed history, canonical transaction simulation, explicit user-presence approval, local signing, multi-RPC verification, independent security audits and jurisdiction-specific regulatory review.

## Testing links

- Live app: `https://aifinpay-wallet-chatgpt.onrender.com/`
- MCP: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`
- Health: `https://aifinpay-wallet-chatgpt.onrender.com/health`
- Source: `https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`
- Privacy: `https://aifinpay-wallet-chatgpt.onrender.com/privacy`
- Terms: `https://aifinpay-wallet-chatgpt.onrender.com/terms`
- Support: `https://aifinpay-wallet-chatgpt.onrender.com/support`

## Owner-supplied submission fields

- Public YouTube demo URL: `TBD`
- Primary `/feedback` Codex Session ID: `TBD_BY_SUBMITTER`
- Final screenshots: `TBD`
