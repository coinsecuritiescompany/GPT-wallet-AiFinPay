# Threat model

| Threat | Likelihood | Impact | Mitigation | Remaining risk |
|---|---:|---:|---|---|
| Prompt injection asks for keys | High | Critical | No key tools/UI/database fields; safe tool descriptions | Production adapters still need secret-scanning and isolation |
| Unauthorized tool call | Medium | High | Session resolution and ownership checks | Demo mode has one fixed user |
| Model initiates unauthorized payment | High | Critical | Prepare/confirm split, policy engine, confirmation token | Host confirmation UX requires final ChatGPT testing |
| Replay attack | Medium | High | Idempotency key and terminal state machine | Multi-instance deployment needs shared locks |
| Duplicate submission | Medium | High | Same-result idempotency and adapter status lookup | Demo adapter only; RPC adapter not built |
| Intent substitution | Medium | Critical | HMAC binds intent ID, user and expiry | Production should also bind canonical full payload/nonce |
| Recipient substitution | Medium | Critical | Recipient stored in prepared intent and never accepted by confirm | UI spoofing remains a review concern |
| Amount manipulation | Medium | Critical | Base-unit parsing and prepared intent binding | Token metadata must be verified in production |
| User/session confusion | Medium | High | Wallet/user IDs resolved server-side | OAuth implementation pending |
| Cross-user access | Medium | Critical | Every intent/policy query filters by authenticated user | Demo session is intentionally single-user |
| Private-key leakage | Low in demo | Critical | No keys exist in demo app | Future signer integration adds risk |
| RPC manipulation | Medium | High | Demo ledger avoids RPC dependency | Production needs trusted/quorum RPC and receipt verification |
| Malicious merchant request | High | High | Merchant/recipient/category allowlists and risk decision | Merchant identity attestation pending |
| Fake confirmation | Medium | Critical | HMAC token, timing-safe compare, expiry | Production needs stronger user-presence signal |
| UI spoofing | Medium | High | Clear branding, exact details, demo badge | Host rendering and accessibility need manual review |
| Logging leakage | Medium | High | Structured minimal logs, no auth headers/tokens | Central log pipeline must preserve redaction |
| Supply-chain compromise | Medium | Critical | Lockfile, limited dependencies, CI checks | Add SCA, provenance and dependency update policy |

