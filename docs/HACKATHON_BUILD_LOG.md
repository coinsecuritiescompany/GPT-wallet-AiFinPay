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

Final local verification: ESLint passed, TypeScript checks passed in all five workspaces, 29 automated tests passed, the single-file React production bundle built, the MCP server built, `/health` returned `ok`, and an MCP `initialize` request completed successfully.

### Current limitations

See `docs/LIMITATIONS.md`. Main gaps are production OAuth/signing/RPC, hosted URL, final ChatGPT screenshots and demo video.

### Evidence placeholders

- `c4608d0` — repository and OpenAI docs audit
- `bf47777` — secure MCP server, policy engine and demo ledger
- `b42edc3` — interactive React wallet widget
- `e4435d5` — tests, deployment and submission documentation
- Codex session reference: `TBD_BY_SUBMITTER`
- Deployment URL: `TBD`
- Video URL: `TBD`
