# Security model

## Protected assets

- recovery words and derived private keys;
- Vault password and encrypted local Vault;
- wallet-to-user association;
- transfer intent and policy integrity;
- confirmation authority and audit continuity;
- future signing and broadcast authorization.

## Implemented controls

- BIP-39 recovery is generated/restored only in the separate browser Vault.
- PBKDF2-SHA256 derives an AES-256-GCM key for local Vault encryption.
- Plaintext recovery state is cleared from React state after the Vault is saved.
- OAuth 2.1 uses authorization codes bound to PKCE S256 challenges and exact redirect/resource values.
- Authorization codes expire after two minutes and are rejected on replay during the server lifetime.
- Access tokens expire after one hour and carry public addresses only; read and write scopes are distinct.
- Production mode rejects missing OAuth identity instead of falling back to a shared demo user.
- Tool schemas do not accept recovery words, private keys or Vault passwords.
- Mainnet mode reads POL and native USDC balances only; sending is blocked.
- Financial amounts use base-unit integer arithmetic.
- Policy decisions are deterministic code, independent of model narration.
- Prepared demo intents are user-scoped, expiring and idempotent.
- Audit records form a local SHA-256 hash chain.
- Widget CSP domains are exact; no wildcard fetch domains are granted.
- Public CI rejects common secret formats, credential files, databases and archives.

## Important limitations

- The free reference uses integrity-protected, self-contained refresh tokens; it has no durable per-token server-side revocation list. Disconnect in ChatGPT removes the client copy, and rotating `SESSION_SECRET` invalidates all outstanding tokens. Production requires durable revocation at a reviewed identity provider.
- Free Render storage is ephemeral, so intent, policy and audit data can reset. OAuth tokens can rehydrate public addresses only.
- Browser local storage is not hardware-backed secure storage.
- PBKDF2 iteration count and wallet derivation need independent cryptographic review.
- RPC fallbacks improve availability but do not protect against coordinated false data.
- The application and wallet code have not completed an external security audit.

## Production gates

Before mainnet sending: durable OAuth revocation, durable scoped storage, transaction simulation, canonical human-readable previews, explicit user presence, local signing, nonce/fee controls, RPC verification, confirmation monitoring, rate limiting, abuse prevention, incident response and independent audits.

The public repository intentionally contains no production secrets, treasury configuration, signing infrastructure or customer data.
