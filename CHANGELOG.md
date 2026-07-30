# Changelog

All notable public changes are documented here. The project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning where practical.

## [Unreleased]

### Added

- Casper-first ordering in the wallet selector and all mainnet registries.
- Network-specific Receive screen with a QR code, full public address and sandbox-compatible copy fallback.
- ChangeNOW-backed cross-chain swap flow: active assets, live quotes, explicit order confirmation, Vault-derived payout/refund addresses, deposit QR, Polygon Vault funding handoff and private status references.
- Swap service security tests for fail-closed configuration, quote ownership, provider response validation and address binding.

### Changed

- ChatGPT widget resource bumped to `wallet-v14` to invalidate previous host caches after the mobile stability release.
- Mobile wallet layout gives the selected network a full-width row so long names remain visible.
- The network scrollbar is an always-visible overlay inside the selector rather than a right-side grid column that a mobile host can clip.
- Widget HTML and MCP JSON responses are compressed in production.
- `open_wallet` is again the single primary model-visible entry point; temporary aliases remain app-only for cached conversations.
- Production Docker images now prune all development-only packages after the verified build.

### Fixed

- Casper remains the default wallet view and keeps Receive/address/QR available when its keyed balance RPC is not configured or is temporarily unavailable.
- OAuth authorization-code replay protection is persisted so it survives a service restart.
- Swap quotes now resolve ticker/network pairs against ChangeNOW's active registry; client-supplied names or images cannot alter the signed order.
- Polygon swap funding no longer substitutes native POL for an unsupported token.
- Vault unlock now verifies that every stored public address still matches the locally encrypted mnemonic.
- A mobile MCP Apps handshake can no longer leave `Opening your wallet…` spinning forever: initialization and tool calls have bounded timeouts and fall back to ChatGPT's compatible tool API when available.
- The widget reports intrinsic size changes to compatible hosts so expanded views and network sheets receive the correct iframe height.

## [0.3.0] - 2026-07-30

### Added

- Casper as the 13th read-only mainnet network: Vault CSPR address derivation (SLIP-44 506, ed25519), native CSPR balance reads via `query_balance`, a Receive row and selector logo, and an optional `CASPER_RPC_AUTH` header for key-gated nodes.
- Locally bundled, full-color logos for all 13 mainnet networks in the wallet selector.
- OAuth 2.1 authorization-code flow with PKCE, dynamic client registration and public-address-only access tokens.
- OAuth security and audience tests, including authorization-code replay rejection.
- Professional public-repository governance, legal, privacy, security and contribution documentation.
- Public/private implementation boundary and automated public-safety scan.
- OpenAI Build Week compliance checklist and ChatGPT app submission metadata.
- Public registry for 13 owner-declared mainnet contract/program deployments and RPC endpoints.
- Per-network EVM asset metadata, exact daily agent-spend accounting and live preflight balance checks.
- Short-lived signed-submission tokens and server-side decoded transaction/signer verification before broadcast.
- Persistent Render disk configuration and rate limits for OAuth, Vault signing/submission and MCP routes.

### Changed

- ChatGPT widget resource bumped to `wallet-v9` so hosts refresh the signing-enabled interface and mobile network sheet.
- Production deployments now disable the shared demo identity and require a personal OAuth authorization.
- The production Blueprint enables Polygon local signing and persistent runtime state; other networks remain balance-only until release-tested.
- Transfer token selection now resolves the correct native symbol, chain-specific USDC address and decimals.
- Mainnet is the default wallet-read mode; demo mode is explicit.

### Fixed

- Clean CI runners now build internal workspace packages before TypeScript validation.
- The mobile wallet network control now opens a scrollable 13-mainnet bottom sheet, switches the displayed public address and preserves the user's selection.
- Wallet pairing retries are idempotent, successful connections open the dashboard automatically, and the mobile selector is anchored inside the visible widget area.
- Returning users now open the wallet dashboard directly; the old `Create or connect your wallet` widget is no longer part of the authenticated path.
- Casper public addresses survive OAuth and storage round-trips.
- Mainnet receipts no longer label successful submissions as demo payments.
- The Vault validates encrypted payload structure, requires a 12-character password and uses a two-step local deletion action.

## [0.1.0] - 2026-07-18

### Added

- TypeScript MCP server and compact React ChatGPT widget.
- Separate browser Vault with local BIP-39 recovery and encrypted storage.
- Polygon PoS POL and native USDC read-only balance adapter.
- Deterministic policy engine, payment intent state machine and audit chain.
- Docker/Render deployment and automated test suite.
