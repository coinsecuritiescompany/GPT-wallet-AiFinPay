# Security model

## Protected assets

- recovery words and derived private keys;
- Vault password and encrypted local Vault;
- wallet-to-user association;
- transfer intent and policy integrity;
- confirmation authority and audit continuity;
- signing and broadcast authorization.

## Implemented controls

- BIP-39 recovery is generated/restored only in the separate browser Vault.
- PBKDF2-SHA256 derives an AES-256-GCM key for local Vault encryption.
- Plaintext recovery state is kept outside React state, cleared on page hide/unmount and never sent to the server.
- Saved Vault payloads are strictly validated before decryption; passwords must contain at least 12 characters.
- OAuth 2.1 uses authorization codes bound to PKCE S256 challenges and exact redirect/resource values.
- Authorization codes expire after two minutes and are rejected on replay during the server lifetime.
- Access tokens expire after one hour and carry public addresses only; read and write scopes are distinct.
- Production mode rejects missing OAuth identity instead of falling back to a shared demo user.
- Tool schemas do not accept recovery words, private keys or Vault passwords.
- Mainnet mode reads native balances on 13 networks and verified Circle USDC on six EVM chains.
- Financial amounts use base-unit integer arithmetic.
- Asset addresses and decimal precision are selected per chain; BNB Smart Chain USDC uses 18 decimals.
- Policy decisions are deterministic code, independent of model narration.
- Prepared intents are user-scoped, expiring and idempotent; daily agent spend is derived from submitted intents.
- EVM signing happens only in the local Vault. A short-lived HMAC token binds submission to the reviewed unsigned transaction.
- Before broadcast, the server decodes the signed transaction, recovers the signer and exactly verifies chain ID, recipient, value, calldata, nonce, gas and EIP-1559 fee fields.
- Sensitive endpoints and MCP requests have bounded in-memory rate limits.
- Audit records form a local SHA-256 hash chain.
- Widget CSP domains are exact; no wildcard fetch domains are granted.
- Swap provider credentials and calls stay on the MCP server. Short-lived signed quote tokens bind the user, assets, amount and expiry; payout/refund addresses are derived from authenticated Vault addresses.
- Creating a swap order never transfers funds. Polygon funding still uses the canonical local-signing flow, and unsupported native signing paths remain blocked.
- Public CI rejects common secret formats, credential files, databases and archives.

## Important limitations

- The reference uses integrity-protected, self-contained refresh tokens; it has no durable per-token server-side revocation list. Disconnect in ChatGPT removes the client copy, and rotating `SESSION_SECRET` invalidates all outstanding tokens. Production requires durable revocation at a reviewed identity provider.
- The production Blueprint declares a persistent disk, but backup, restore, multi-instance locking and disaster-recovery procedures are not yet demonstrated.
- Browser local storage is not hardware-backed secure storage.
- PBKDF2 iteration count and wallet derivation need independent cryptographic review.
- RPC fallbacks improve availability but do not protect against coordinated false data.
- There is no full simulation, mempool/confirmation monitor or replacement/cancellation workflow yet.
- The application and wallet code have not completed an external security audit.
- The swap provider is an external dependency with its own availability, pricing, compliance and execution risks. Casper-source deposits currently require an external Casper signer.

## Production gates

Before broad public advertising or enabling more signing networks: durable OAuth revocation, tested backups, full transaction simulation, confirmation monitoring, distributed rate limiting, abuse detection, observability, incident response, independent application/cryptographic review and jurisdiction-specific legal approval.

The public repository intentionally contains no production secrets, treasury configuration, signing infrastructure or customer data.
