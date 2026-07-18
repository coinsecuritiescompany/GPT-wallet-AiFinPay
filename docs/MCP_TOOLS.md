# MCP tools

The server exposes 19 focused tools. User IDs and wallet IDs are resolved server-side and are never accepted from the model. Every tool declares explicit read-only, destructive and open-world annotations.

## Wallet connection and networks

- `list_supported_mainnets()` — lists 12 derived address networks and current signing status.
- `create_wallet_pairing()` — creates private temporary pairing state and returns a short-lived Vault URL.
- `get_wallet_connection()` — returns connection status and public addresses only.

## Read tools

- `get_wallet_summary(network?)`
- `get_token_balance(token, network)`
- `get_transaction_status(transactionHash? | transferIntentId?)`
- `list_transactions(network?, token?, initiatedBy?, limit, cursor?)`
- `list_agent_policies()`
- `evaluate_payment_request(payment fields, agent, merchant, risk)`
- `get_audit_log(limit)`

In mainnet mode, wallet summary and balance tools select Polygon and read POL/native USDC through the mainnet adapter. Mainnet transaction history currently returns an honest empty result until an indexer is integrated.

## State and destructive tools

- `prepare_transfer(...)` writes a private demo intent in demo mode; mainnet mode refuses.
- `confirm_transfer(...)` irreversibly completes an eligible demo intent; mainnet mode refuses.
- `cancel_transfer(transferIntentId)` irreversibly cancels an eligible intent.
- `create_agent_policy(...)` previews and then saves private policy state.
- `update_agent_policy(policyId, enabled, confirmation=true)` updates private policy state.
- `revoke_agent_policy(policyId, confirmation=true)` irreversibly revokes private policy state.

None of these tools changes public internet state in the current implementation. Real-chain broadcasting will require new annotations and review when implemented.

## Render tools

- `render_wallet(network?)`
- `render_transfer_preview(transferIntentId)`
- `render_transaction_receipt(transferIntentId)`

Render tools attach `ui://aifinpay/wallet-v3.html`. The widget communicates through the MCP Apps bridge and keeps data-fetching responsibilities on the server.

## Submission note

All tools currently omit `outputSchema`. This is not required for runtime, but adding precise per-tool output schemas is recommended before public plugin review so models can use results more reliably.
