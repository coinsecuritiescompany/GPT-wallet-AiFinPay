# Hackathon build log

## 2026-07-18

Baseline repository state: empty target repository; only the supplied task prompt existed locally.

### Added

- npm workspace monorepo and TypeScript configuration
- shared financial/domain schemas
- wallet adapter contract and deterministic demo ledger
- deterministic agent policy engine and payment-intent state machine
- SQLite store, confirmation service and SHA-256 audit hash chain
- 16 MCP tools and versioned widget resource
- React single-file widget with wallet, transfer, blocked, policy, history, audit and receipt views
- unit, integration, MCP, widget and security tests
- Docker, local environment and deployment configuration
- repository audit, architecture, security, threat model, tool reference, setup, limitations, Devpost draft and demo script

### Changed

No pre-existing production files were modified.

### Tests added

Amount parsing/formatting, address/schema behavior through tools, policy decisions, state transitions, idempotency, confirmation token enforcement, ownership boundary, audit chain tampering, MCP registration and widget rendering/actions.

### Current limitations

See `docs/LIMITATIONS.md`. Main gaps are production OAuth/signing/RPC, hosted URL, final ChatGPT screenshots and demo video.

### Evidence placeholders

- Commit links: populate after push
- Codex session reference: `TBD_BY_SUBMITTER`
- Deployment URL: `TBD`
- Video URL: `TBD`

