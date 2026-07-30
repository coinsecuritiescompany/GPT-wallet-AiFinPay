# Repository audit

Audit date: 2026-07-18, before implementation.

## Baseline

The local workspace contained only the supplied build prompt. The target GitHub repository returned no refs. There was no source tree, Git history, package manifest or deployment configuration to inspect.

## Existing reusable functionality

None was present in this repository. No AiFinPay production code was copied or inferred to exist here.

## Missing functionality at baseline

- Frontend and React widget
- Backend/MCP server
- Wallet SDK or backend adapter
- Authentication and account linking
- Blockchain provider/signing
- Wallet creation/import
- Token balances and transaction history
- Database models and migrations
- MCP/Apps SDK code
- Tests, environment configuration and deployment

## Unsafe legacy functionality

None was present. Searches for private keys, seed phrases, signing, WalletConnect, USDC, Polygon, Base, Ethereum, MCP, Apps SDK and API authentication had no source files to inspect.

## Hackathon-specific additions

The repository was scaffolded as an npm workspace monorepo with a TypeScript MCP server, single-file React widget, shared schemas, deterministic demo ledger, backend adapter contract, policy engine, SQLite persistence, audit chain, tests and submission documentation.

Subsequent work added a separate locally encrypted non-custodial Vault, address derivation across 13 mainnet networks, OAuth 2.1 with PKCE, mainnet balances across all 13 networks (native token everywhere, including Casper CSPR through its separate non-EVM JSON-RPC path; verified Circle USDC on 6 EVM chains), per-network EVM transfer gates, local signing, signed-byte validation, mobile bundle/scroll optimization and public repository governance/security controls.

## Reuse boundary

The `WalletAdapter` interface is the integration seam for chain access and user-controlled signing. The public repository contains the reviewable OAuth, MCP, policy, local Vault and EVM transfer contracts. Customer data, proprietary risk logic, custodial infrastructure, deployment credentials and operational secrets remain private.
