# Hackathon build log

## Baseline — July 18, 2026

The target repository had no implementation before the Build Week work began. No production AiFinPay wallet, backend, SDK, authentication or blockchain component was copied into the submission.

## Build Week implementation

### Core app

- npm workspace TypeScript monorepo;
- shared financial schemas and base-unit arithmetic;
- 19 MCP tools and a versioned MCP App resource;
- compact React ChatGPT wallet widget;
- deterministic policy engine, intent state machine and audit chain;
- Docker, Render and CI configuration.

### Non-custodial Vault

- local 12/15-word BIP-39 create/restore flow;
- EVM, Solana, NEAR and Aptos address derivation;
- local PBKDF2-SHA256 and AES-256-GCM encryption;
- short-lived public-address-only pairing;
- recovery verification and encrypted backup flow.

### Mainnet and mobile iteration

- Polygon PoS chain metadata and native USDC contract;
- RPC fallback adapter for live POL and USDC balance reads;
- mainnet Receive view and honest empty-history state;
- explicit mainnet signing/broadcast safety gate;
- Vault split into a separate build, reducing the inline widget payload;
- Render health metadata and automatic deployment configuration.

### Repository and submission readiness

- architecture, security, threat, privacy, terms and compliance documents;
- public/private repository boundary;
- contribution, governance, support and release processes;
- public secret/artifact scanner, dependency audit and CodeQL;
- Devpost checklist, submission copy and three-minute demo script.

## Codex collaboration

Codex researched official documentation, implemented code and tests, diagnosed deployment/mobile failures, inspected live health responses, compared repository and deployment state, and prepared review materials. Human decisions controlled custody boundaries, mainnet risk, public/private scope and product positioning.

## Verification history

- Initial reference implementation: lint, typecheck, build and 33 tests.
- Wallet/Vault and mainnet iteration: lint, typecheck, build and 41 tests.
- Public repository hardening: full checks, dependency audit and hosted-route verification recorded in GitHub history.

## Evidence

Use the dated GitHub commit history as the source of truth for implementation chronology. The Devpost submission must also include the primary `/feedback` Codex Session ID supplied by the repository owner.

- Deployment: `https://aifinpay-wallet-chatgpt.onrender.com/`
- Source: `https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`
- Codex Session ID: `TBD_BY_SUBMITTER`
- Public video: `TBD`
