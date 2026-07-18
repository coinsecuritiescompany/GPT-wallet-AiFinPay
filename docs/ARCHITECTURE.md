# Architecture

## System view

```mermaid
flowchart TD
    U["User"] --> C["ChatGPT host"]
    C --> M["Stateless MCP transport"]
    M --> A["OAuth 2.1 token verifier"]
    M --> T["Tool handlers"]
    T --> P["Policy and intent services"]
    T --> R["Polygon mainnet read adapter"]
    T --> S[("SQLite runtime intent/audit state")]
    C --> W["Compact React widget"]
    U --> V["Separate browser Vault"]
    V -->|"OAuth consent; public addresses"| A
```

## Build split

The ChatGPT widget and Vault are separate single-file bundles:

- `dist/index.html` contains wallet display and interaction code only;
- `dist-vault/vault.html` contains wallet derivation and encryption dependencies.

This keeps the inline mobile widget small while loading cryptographic code only when the user intentionally opens the Vault page.

## Mainnet read flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as ChatGPT
    participant M as MCP server
    participant R as Polygon RPC
    U->>C: Open my wallet
    C->>M: render_wallet
    M->>M: verify OAuth audience, expiry and scope
    M->>R: eth_getBalance
    M->>R: USDC balanceOf(address)
    R-->>M: public onchain state
    M-->>C: structured wallet summary + widget
```

RPC reads use fallbacks and a short in-memory cache. The native Polygon USDC contract and chain metadata are defined in the shared package. No private key is present in this flow.

## One-time Vault authorization flow

1. An unauthenticated wallet tool declares `wallet:read` and returns an MCP OAuth challenge.
2. ChatGPT starts an OAuth 2.1 authorization-code flow with PKCE and opens `/vault?oauth=...`.
3. The browser creates/restores the Vault locally and derives public addresses.
4. The user explicitly approves sharing those public addresses with ChatGPT.
5. The server returns a short-lived, PKCE-bound authorization code. ChatGPT exchanges it for a one-hour access token and a renewable token.
6. Later chats attach the access token, so `render_wallet` returns the dashboard directly. The token can rehydrate public addresses after a free Render restart.

Recovery words, Vault password, encrypted ciphertext and decrypted signing material are not part of the OAuth request or token.

## Trust boundaries

1. **Model:** can choose a tool but cannot access local recovery material or determine authoritative policy output.
2. **Widget:** receives scoped structured content and uses the MCP bridge for named actions.
3. **Vault:** owns recovery, derivation and future signing on the user's device.
4. **Server:** validates tool input and stores only public addresses plus reference metadata.
5. **RPC:** supplies untrusted public chain data; fallbacks improve availability but are not a cryptographic quorum.
6. **Private production system:** future authentication, durable storage and signing orchestration stay outside the public repository.

## Current write boundary

Mainnet `prepare_transfer` and `confirm_transfer` return a security error. Demo mode can exercise intent, policy, confirmation and receipt flows against a deterministic test ledger. Real-chain transaction construction, user review, local signing and broadcasting remain future security-gated work.
