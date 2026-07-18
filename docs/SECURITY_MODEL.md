# Security model

## Assets protected

Wallet ownership, transfer intent integrity, spending policy integrity, confirmation authority, audit continuity and future signing credentials.

## Controls implemented

- Demo/testnet default and visible `DEMO ONLY` labelling.
- No seed phrase, recovery phrase or private-key import/export path.
- No signing secret in database, MCP results, widget, logs or environment example.
- Server-side user/wallet resolution.
- Zod validation of network, token, address, amount, expiry, IDs and bounds.
- Base-unit integer arithmetic; scientific notation and excess decimals rejected.
- One-time intent preparation with idempotent retry behavior and changed-payload rejection.
- Expiring HMAC confirmation tokens scoped to intent and user.
- Explicit intent state transitions; terminal states cannot be replayed.
- Deterministic policy engine, independent from model explanations.
- SHA-256 audit hash chain with metadata hashing.
- Safe typed errors; no stack trace or secret returned to the widget/model.
- Exact widget CSP domains with no iframe permission.

## Production requirements

Before real funds: external security audit, OAuth 2.1 account linking, scoped authorization on every tool, managed Postgres, rate limiting, replay-resistant distributed idempotency, HSM/MPC or user-controlled signing, RPC quorum/verification, transaction simulation, monitoring, incident response and key rotation.

The current audit chain is tamper-evident inside one database. It is not immutable and does not provide legal non-repudiation.

