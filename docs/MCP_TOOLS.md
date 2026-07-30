# MCP tools

The server exposes 25 focused tools. User IDs and wallet IDs are resolved server-side and are never accepted from the model. Every tool declares explicit read-only, destructive, open-world and idempotency annotations.

## Wallet connection and networks

- `list_supported_mainnets()` — lists 13 derived-address networks and the runtime signing status of each.
- `open_wallet()` — primary stable open-wallet action.
- `open_wallet_current()` — app-only compatibility alias for conversations that cached the temporary v13 entry point.
- `create_wallet_pairing()` — compatibility name for the open-wallet action; OAuth links a first-time user and returning users receive the dashboard directly.
- `get_wallet_connection()` — returns the authenticated wallet status and public addresses only.

User-specific read tools declare `wallet:read`; intent, confirmation and policy mutations declare `wallet:write`. They return an MCP `WWW-Authenticate` challenge when the required token or scope is absent. `list_supported_mainnets` remains public.

## Read tools

- `get_wallet_summary(network?)`
- `get_token_balance(token, network)`
- `get_transaction_status(transactionHash? | transferIntentId?)`
- `list_transactions(network?, token?, initiatedBy?, limit, cursor?)`
- `list_agent_policies()`
- `evaluate_payment_request(payment fields, agent, merchant, risk)`
- `get_audit_log(limit)`

In mainnet mode, wallet summary and balance tools read native balances across all 13 networks and verified Circle USDC on six EVM networks. Transaction history is currently a best-effort Polygon-only indexed view.

## State and destructive tools

- `prepare_transfer(...)` validates policy and funds, writes an expiring intent and returns the local Vault review URL on a signing-enabled EVM network.
- `confirm_transfer(...)` records explicit approval and returns the local Vault signing URL. The Vault signs locally and submits the signed transaction to the authenticated broadcast endpoint.
- `cancel_transfer(transferIntentId)` irreversibly cancels an eligible intent.
- `create_agent_policy(...)` previews and then saves private policy state.
- `update_agent_policy(policyId, enabled, confirmation=true)` updates private policy state.
- `revoke_agent_policy(policyId, confirmation=true)` irreversibly revokes private policy state.

## Cross-chain swap tools

- `list_swap_assets()` — reads the provider's active assets and returns only networks whose payout address maps unambiguously to the connected Vault.
- `get_swap_quote(fromAsset, toAsset, fromAmount)` — returns an estimated quote and a short-lived HMAC-bound quote token; it creates no order and moves no funds.
- `create_swap_order(quoteToken, confirmed=true)` — after explicit user confirmation, creates a provider deposit order. Payout and refund addresses are resolved server-side from the authenticated Vault rather than accepted from the model.
- `get_swap_status(orderReference)` — reads status using a private, user-bound signed order reference.

These tools are marked open-world because they call ChangeNOW. The partner API key is server-side only. Creating an order does not transfer funds; funding still requires a separate user-signed wallet transaction.

MCP tools do not receive recovery words, private keys or signed transaction bytes. Public-chain broadcast happens only after the user opens the separate Vault page, reviews the canonical transaction and signs it locally. The server verifies that the signed fields and signer exactly match the reviewed transaction before broadcasting.

## Render tools

- `render_wallet(network?)`
- `render_transfer_preview(transferIntentId)`
- `render_transaction_receipt(transferIntentId)`

Render tools and the primary open-wallet action attach `ui://aifinpay/wallet-v14.html`. Legacy resource URIs through `wallet-v13.html` continue to resolve to the current HTML for existing conversations. The widget communicates through the standard MCP Apps bridge, falls back to ChatGPT's compatibility tool API if a mobile host does not finish the bridge handshake, and keeps data-fetching responsibilities on the server.

## Submission note

All tools declare and validate a shared structured-content output envelope with a required `view` discriminator. View-specific fields pass through that envelope and remain available to the model and widget.
