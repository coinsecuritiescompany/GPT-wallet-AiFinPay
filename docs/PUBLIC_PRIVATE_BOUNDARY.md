# Public/private repository boundary

The public repository is a transparent, runnable reference implementation. The private repository is the future production system of record. This separation protects users and proprietary operations while preserving an auditable public interface.

## Public repository

Appropriate public content:

- MCP tool contracts, input validation and non-sensitive output shapes;
- ChatGPT widget and public Vault implementation;
- reference policy engine and state machine;
- read-only public-chain adapters;
- synthetic fixtures and deterministic tests;
- threat model, security controls and public architecture;
- setup, deployment and submission materials;
- open-source license and contribution workflow.

## Private repository

Private-only content:

- production OAuth clients, credentials and account-linking internals;
- production databases, migrations containing customer assumptions and live data;
- signing orchestration, HSM/MPC policies, treasury and hot-wallet configuration;
- proprietary fraud, sanctions, risk-scoring and merchant rules;
- production RPC/API credentials and paid-provider contracts;
- infrastructure state, deploy tokens, DNS/Cloudflare secrets and backups;
- customer integrations, pricing, contracts and non-public SDK endpoints;
- monitoring destinations, incident artifacts and penetration-test reports;
- real user data, transaction data and support exports.

## Repository interface

Shared contracts should be versioned and intentionally exported. The private implementation can implement the public `WalletAdapter` boundary without exposing credentials or proprietary decision logic. Changes to shared schemas require compatibility tests in both repositories before release.

## Transfer checklist

Before moving code or documentation from private to public:

1. Remove credentials, internal URLs, customer identifiers and real data.
2. Replace examples with synthetic values.
3. Review dependency and content licenses.
4. Run `npm run security:public`.
5. Review the diff manually for operational and business-sensitive information.
6. Require maintainer approval for auth, signing, compliance or infrastructure content.

Public source transparency does not require publishing production secrets or customer data.
