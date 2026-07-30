# AiFinPay Wallet production audit — 2026-07-31

## Audited sources

- `coinsecuritiescompany/GPT-wallet-AiFinPay` at `9506ddb500ec668a07d5a8e56a4e00ef6277703f`.
- Connected Render service `srv-d9dj0bjrjlhs73anpb1g`.
- Private Obsidian repository `AiFinPay/knowledge-vault`:
  - `network-source-of-truth.md`;
  - `network-gaps-and-blockers.md`;
  - `evidence/deployments.json`;
  - `evidence/network-support-matrix.csv`;
  - July remediation records.
- Linked chain repositories and SDK records referenced by the Obsidian source of truth.

## Result

The wallet is a real non-custodial implementation. Recovery material is generated, encrypted and used in the browser Vault. The server stores public addresses only and broadcasts transactions only after local signing and signed-byte validation.

The current product is not yet a 13-network send wallet. It is a 13-network receive/balance wallet with a generic EVM sender and no native signer for Solana, NEAR, Aptos or Casper.

## Network matrix

| Network | Receive | Balance | Direct wallet send | AIFP contract payment |
| --- | --- | --- | --- | --- |
| Polygon | live | POL + USDC | implemented and production-enabled | no clean paid E2E |
| Avalanche | live | AVAX + USDC | generic EVM path; enabled after this release | no clean paid E2E |
| Arbitrum | live | ETH + USDC | generic EVM path; enabled after this release | no clean paid E2E |
| BNB Chain | live | BNB + USDC, 18 decimals | generic EVM path; enabled after this release | no clean paid E2E |
| Base | live | ETH + USDC | generic EVM path; enabled after this release | no clean paid E2E |
| Unichain | live | ETH | generic EVM path; enabled after this release | no clean paid E2E |
| Optimism | live | ETH + USDC | direct transfer path enabled; legacy splitter remains blocked | splitter stablecoin configuration is unsafe |
| BOT Chain | live | BOT | generic EVM code exists; restricted pending live fee/broadcast proof | restricted splitter |
| XRPL EVM | live | XRP | generic EVM code exists; restricted pending live fee/broadcast proof | restricted splitter |
| Solana | live | SOL | not implemented in this wallet | deployed instruction mismatch remains |
| NEAR | live | NEAR | not implemented in this wallet | splitter MVP only |
| Aptos | live | APT | not implemented in this wallet | splitter MVP only |
| Casper | live | CSPR | not implemented in this wallet | contract deployed, wallet signer absent |

Direct wallet send and AIFP settlement are separate paths. Enabling a normal token transfer does not claim that the AiFinPay split contract is production-ready.

## Render audit

The checked-in Blueprint describes:

- Starter plan;
- automatic deploys;
- persistent disk at `/var/data`;
- SQLite database at `/var/data/aifinpay-runtime.sqlite`.

The connected service actually reports:

- Free plan;
- Oregon region;
- auto-deploy disabled;
- one instance;
- no attached persistent disk in the service configuration returned by Render.

This is not the intended production topology. The app stores OAuth replay records, wallet connections, intents, policies and audit events in SQLite. The local encrypted Vault and private keys are not exposed by this mismatch, but server restarts can lose connection state and transaction workflow records.

### Required Render release gate

1. Move the existing public endpoint to an always-on paid service.
2. Attach and verify a persistent disk mounted at `/var/data`.
3. Confirm `DATABASE_URL=/var/data/aifinpay-runtime.sqlite`.
4. Enable auto-deploy only after branch protection and CI are enforced.
5. Test database backup and restore.
6. Prefer Frankfurt for the current European user base.
7. Record p50/p95 latency for `/health`, MCP initialize, `tools/list`, `open_wallet` and the widget resource.

The current Render connector can inspect, deploy and update environment variables, but it does not expose an operation for changing the existing Docker service plan, region or disk attachment. Those infrastructure changes must be applied in the Render dashboard or by a Render API surface that supports service updates and disks.

## Security findings

### Implemented correctly

- BIP-39 12/15-word creation and restore.
- Device-local PBKDF2-SHA256 and AES-256-GCM encryption.
- Deterministic addresses for EVM, Solana, NEAR, Aptos and Casper.
- OAuth 2.1 authorization-code flow with PKCE.
- Short-lived HMAC signing requests.
- Local EVM signing.
- Exact comparison of chain ID, recipient, value, calldata, nonce, gas and fee fields before broadcast.
- Per-network USDC addresses and decimals, including BNB USDC at 18 decimals.
- Mainnet RPC failover and explicit RPC timeout.

### Open blockers

- Solana, NEAR, Aptos and Casper need separate unsigned-transaction models, local signers, exact validators and broadcasters.
- Transaction history is Polygon-only.
- Rate limits are process-local and reset after restart.
- No clean paid AIFP-2 E2E exists on any chain.
- Optimism/BOT/XRPL legacy splitter configuration must not be used for stablecoin settlement.
- Solana SDK/backend references an instruction not present in the deployed program.
- Non-Polygon contract ownership is concentrated in one EOA according to the Obsidian evidence record.

## Release decision

This release may truthfully be described as:

> AiFinPay Wallet provides non-custodial receive and live balance access across 13 mainnets, with locally signed direct transfers enabled on seven EVM networks. Solana, NEAR, Aptos and Casper remain receive-only until their chain-specific signers pass production tests. AIFP settlement readiness is tracked separately.

It must not be described as full 13-network sending or fully proven AIFP settlement yet.
