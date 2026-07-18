# Changelog

All notable public changes are documented here. The project follows the principles of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning where practical.

## [Unreleased]

### Added

- Locally bundled, full-color logos for all 12 mainnet networks in the wallet selector.
- Professional public-repository governance, legal, privacy, security and contribution documentation.
- Public/private implementation boundary and automated public-safety scan.
- OpenAI Build Week compliance checklist and ChatGPT app submission metadata.
- Public registry for 12 owner-declared mainnet contract/program deployments and RPC endpoints.

### Changed

- ChatGPT widget resource bumped to `wallet-v7` so hosts refresh the embedded interface after deployment.
- Documentation now reflects the local non-custodial Vault and live read-only Polygon mainnet balances.
- Mainnet is the default wallet-read mode; demo mode is explicit.

### Fixed

- Clean CI runners now build internal workspace packages before TypeScript validation.
- The mobile wallet network control now opens a real 12-mainnet selector, switches the displayed public address and preserves the user's selection.
- Wallet pairing retries are idempotent, successful connections open the dashboard automatically, and the mobile selector is anchored inside the visible widget area.

## [0.1.0] - 2026-07-18

### Added

- TypeScript MCP server and compact React ChatGPT widget.
- Separate browser Vault with local BIP-39 recovery and encrypted storage.
- Polygon PoS POL and native USDC read-only balance adapter.
- Deterministic policy engine, payment intent state machine and audit chain.
- Docker/Render deployment and automated test suite.
