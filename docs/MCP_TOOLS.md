# MCP tools

All tools return concise `content`, reusable `structuredContent`, and widget-only `_meta` only when attaching UI. User IDs and wallet IDs are never accepted from the model.

## Read tools

- `get_wallet_summary(network?)`
- `get_token_balance(token, network)`
- `get_transaction_status(transactionHash? | transferIntentId?)`
- `list_transactions(network?, token?, initiatedBy?, limit, cursor?)`
- `list_agent_policies()`
- `evaluate_payment_request(payment fields, agent, merchant, risk)`
- `get_audit_log(limit)`

## State/write tools

- `prepare_transfer(recipient, amount, token, network, memo?, agent?, merchant?, purpose?, idempotencyKey)` creates a non-broadcast intent.
- `confirm_transfer(transferIntentId, confirmationToken, idempotencyKey)` executes only a valid prepared intent.
- `cancel_transfer(transferIntentId)` cancels eligible intents.
- `create_agent_policy(...)` returns a preview when confirmation fields are absent, then saves the exact draft after confirmation.
- `update_agent_policy(policyId, enabled, confirmation=true)`.
- `revoke_agent_policy(policyId, confirmation=true)`.

## Render tools

- `render_wallet(network?)`
- `render_transfer_preview(transferIntentId)`
- `render_transaction_receipt(transferIntentId)`

Render tools attach `ui://aifinpay/wallet-v1.html`. The widget calls data/write tools through the MCP Apps bridge without remounting.

## Policy decisions

Authoritative values are `AUTO_APPROVED`, `HUMAN_APPROVAL_REQUIRED`, and `BLOCKED`. Reason codes are stable machine-readable enums from `packages/shared`.

