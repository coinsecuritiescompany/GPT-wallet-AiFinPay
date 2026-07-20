# Hackathon build log

## Baseline — July 18, 2026

The target repository had no implementation before the Build Week work began. No production AiFinPay wallet, backend, SDK, authentication or blockchain component was copied into the submission.

## Build Week implementation

### Core app

- npm workspace TypeScript monorepo;
- shared financial schemas and base-unit arithmetic;
- 20 MCP tools and a versioned MCP App resource;
- compact React ChatGPT wallet widget;
- deterministic policy engine, intent state machine and audit chain;
- Docker, Render and CI configuration.

### Non-custodial Vault

- local 12/15-word BIP-39 create/restore flow;
- EVM, Solana, NEAR, Aptos and Casper address derivation;
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

### All-12-network read-only balances — July 19, 2026

- generalized the single-network Polygon reader into one `MainnetAdapter` covering every family: 9 EVM chains (`eth_getBalance` + ERC-20 `balanceOf`), Solana (`getBalance`), NEAR (`query view_account`) and Aptos (REST `CoinStore` resource);
- consolidated `LIVE_NETWORKS` registry: per-network family, public RPC fallbacks, native token (symbol + decimals) and — where verified on-chain — the Circle USDC contract;
- verified each USDC contract on 2026-07-19 by reading `symbol()`/`decimals()` from the live chain; shipped the 6 confirmed ones (Polygon, Avalanche, Arbitrum, Base, Optimism at 6 decimals; **BNB at 18 decimals**) and native-only reads elsewhere — no placeholder token addresses;
- expanded `NetworkId`, the network schema and the ChatGPT tools so any of the 12 mainnets is selectable and its live balances flow through end to end;
- optional `<NETWORK>_RPC_URLS` overrides with public defaults; signing/broadcasting stay disabled;
- live end-to-end read confirmed on all 12 networks; adapter unit tests cover Polygon, Base (chain-specific USDC), BNB (18-decimal USDC) and NEAR (non-EVM native).

### Casper as the 13th network — July 19, 2026

- extended the Vault (SLIP-44 coin type 506, ed25519) to derive a Casper account public key alongside the existing families, and surfaced its address in the Receive view and network selector;
- taught `MainnetAdapter` to read native CSPR via the `query_balance` JSON-RPC method keyed on the account's main purse public key (9 decimals), with an unfunded/no-purse account resolving to a zero balance instead of an error;
- added a per-network Authorization header (`CASPER_RPC_AUTH`) because Casper mainnet nodes are API-key gated; the key is provided by environment/deployment configuration and never committed;
- adapter unit tests cover the CSPR read (auth header + `query_balance` shape) and the unfunded-account zero case with a mocked RPC;
- links back to the AiFinPay settlement contract already live on Casper mainnet (`contract-9903a5e3…`); signing/broadcasting remain disabled. Live CSPR read is to be confirmed on the deployment, which holds the provider key.

### Widget live balances across every network — July 19, 2026

- fixed the wallet card that only ever showed a live balance for Polygon: selecting any network now calls `get_wallet_summary` for that network and renders the emitted live read-only balances, so all 13 mainnets show real data instead of a "demo"/placeholder balance;
- generalized the balance display to use USDC as the headline where a verified Circle contract exists and the network's native token (ETH, BNB, NEAR, CSPR, …) elsewhere, with a per-network loading state and an honest "balance unavailable — retry shortly" fallback when an RPC read fails;
- a connected wallet in mainnet mode is never labelled demo; the demo balance path is reserved for explicit demo mode only.

### Persistent in-ChatGPT login / onboarding — July 19, 2026

- confirmed and documented that the wallet connection is durable at the OAuth layer: the access/refresh token carries the user's public addresses and a deterministic `userId`, so every returning tool call re-establishes the connection and "open my wallet" goes straight to the dashboard — no repeated Create/Connect, and no dependence on server-side session storage;
- the recovery phrase and private keys are created, encrypted (PBKDF2-SHA256 + AES-256-GCM) and held only inside the separate Vault origin; ChatGPT and the backend ever receive public addresses only — the seed is never passed to a ChatGPT message, the LLM, a tool argument, logs or the database;
- added a returning-device unlock gate: a device that already holds an encrypted vault must unlock (prove control of the password) before the wallet can be re-shared with ChatGPT, with recovery-phrase and remove-device escape hatches — re-auth on device-change, matching the onboarding spec, with no change to the normal in-ChatGPT dashboard path;
- signing and broadcasting remain disabled; the transaction-confirmation, passkey/biometric unlock and MPC "no separate page" items are a deliberate next architecture step (they overlap the backend lane) and are not shipped blind.

### Non-custodial EVM signing + broadcast — July 20, 2026

- built the send path as a strictly non-custodial handoff: the server never holds or receives a private key. `MainnetAdapter.buildTransferTransaction` assembles the exact EIP-1559 fields for a native or USDC transfer (nonce from `eth_getTransactionCount` pending, fees from `eth_maxPriorityFeePerGas` + latest-block base fee, gas from `eth_estimateGas` with a 20% buffer), the browser Vault signs them locally with the on-device key via viem, and `broadcastRawTransaction` publishes the raw signed tx through `eth_sendRawTransaction`. The custodial `execute()` path stays permanently locked;
- added a per-network gate: signing/broadcasting only activate for networks listed in `AIFINPAY_SIGNING_NETWORKS` (validated as EVM), empty by default so production stays send-locked exactly as before until deliberately switched on;
- a self-contained, HMAC-signed, short-lived signing token (`SigningRequestService`, domain-separated from the confirmation token) carries the intent to the Vault; two new endpoints — `POST /api/vault/sign-request` (returns the unsigned tx + human-readable display) and `POST /api/vault/submit-signed` (broadcasts and records the result) — bracket the on-device signature;
- `prepare_transfer` now returns a device signing link for enabled networks instead of a blanket safety error; the intent state machine walks REQUIRES_CONFIRMATION → CONFIRMED → SIGNING → SUBMITTED → PENDING/COMPLETED via `finalizeVaultBroadcast`, which is idempotent against double submission and always records the on-chain hash to the audit chain;
- the Vault gained a review-and-sign screen (`?sign=` flow): unlock, show amount/recipient/network, sign locally, broadcast, then a block-explorer link. The decrypted phrase is held only in a ref and wiped immediately after signing;
- covered by unit tests: EIP-1559 USDC and native transaction construction (fees, gas buffer, transfer calldata), raw broadcast + malformed-tx rejection, and full signing-token round-trip/tamper/expiry/wrong-secret cases. `npm run check` green (security, lint, typecheck, 72 tests, build).

## Codex collaboration

Codex researched official documentation, implemented code and tests, diagnosed deployment/mobile failures, inspected live health responses, compared repository and deployment state, and prepared review materials. Human decisions controlled custody boundaries, mainnet risk, public/private scope and product positioning.

## Verification history

- Initial reference implementation: lint, typecheck, build and 33 tests.
- Wallet/Vault and mainnet iteration: lint, typecheck, build and 41 tests.
- Public repository hardening: full checks, dependency audit and hosted-route verification recorded in GitHub history.
- All-12-network read-only balances: security check, lint, typecheck, build and 61 tests, plus a live on-chain read across every network.

## Evidence

Use the dated GitHub commit history as the source of truth for implementation chronology. The Devpost submission must also include the primary `/feedback` Codex Session ID supplied by the repository owner.

- Deployment: `https://aifinpay-wallet-chatgpt.onrender.com/`
- Source: `https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`
- Codex Session ID: `TBD_BY_SUBMITTER`
- Public video: `TBD`
