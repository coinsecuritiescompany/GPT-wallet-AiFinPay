# GPT Wallet — Product Analytics

Implemented 6 Aug 2026 to the spec agreed in the founders' chat: server-side
tracking is authoritative for the transaction funnel, widget events are
directional UI telemetry only, and nothing sensitive is ever collected.

## Principles

1. **Server-side events are the source of truth.** Intent creation, signing
   requests, signature validation, broadcast and confirmation are recorded by
   the server at the moment it performs them. A UI event is never treated as
   proof that a transaction happened.
2. **No sensitive data.** No private keys, recovery phrases, passwords, or IP
   addresses. Wallet addresses are never written to analytics at all. Users
   appear only as `HMAC-SHA256(salt, userId)` truncated to 24 hex chars, where
   the salt is derived from the server secret and the userId is itself already
   a hash of addresses — the pseudonym is irreversible and cannot be joined
   back to on-chain identities even with read access to the database.
3. **Analytics can never break the product.** Every write is wrapped; failures
   are logged and swallowed.

## Event names and properties

Common columns: `ts`, `event`, `source_kind` (`server` | `ui`), `user_hash`,
`network`, `asset`, `amount`, `stage`, `error_code`, `platform`,
`widget_version`, `referral`, `intent_id`.

### Server events (authoritative)

| Event | Recorded when | Extra properties |
|---|---|---|
| `connector_connected` | OAuth authorization approved in the Vault | `referral` (first touch) |
| `vault_connected` | wallet pairing completed / addresses linked | `referral` |
| `wallet_opened` | `open_wallet` / `render_wallet` served a wallet view | `network`, `widget_version` |
| `balance_view` | a balance or summary tool answered | `network`, `asset` |
| `transfer_prepare_started` | `PaymentService.prepare` entered | `network`, `asset`, `amount` |
| `transfer_prepared` | intent created | `stage` = policy decision, `intent_id` |
| `transfer_prepare_failed` | prepare threw | `error_code` |
| `signing_request_opened` | the Vault fetched a signing payload | `intent_id`, `network`, `asset`, `amount` |
| `transaction_signed` | a signed transaction passed local validation | same |
| `transaction_broadcast` | the network accepted the raw transaction | same |
| `transaction_confirmed` / `transaction_failed` | final intent status | `stage` on failure |
| `transfer_cancelled` | user cancelled a prepared intent | `intent_id` |
| `stage_error` | any stage rejected | `stage` (`prepare` / `sign_request` / `submit_signed` / `execution`), `error_code` |

### UI events (widget, non-authoritative)

`widget_loaded`, `wallet_viewed`, `network_selected`, `balance_viewed`,
`transfer_form_opened` — sent by the widget through the hidden `track_ui_event`
tool with `platform` (`desktop` / `web` / `android` / `ios` / `unknown`) and the
current `widget_version`. The platform comes from the host handshake when the
host reveals it, else from the user agent.

## Database tables

- `analytics_events` — one row per event, columns above, indexed on `ts`,
  `(event, ts)` and `(user_hash, ts)`.
- `analytics_users` — `user_hash`, `first_seen`, `referral` (first touch wins).
- Transfer counts on the dashboard come from `payment_intents` (the operational
  record), not from events, so they cannot drift from reality.

## Unique users without sensitive data

"Unique user" = distinct `user_hash`. The hash is deterministic per deployment
(so DAU/WAU and funnels join correctly) and meaningless outside it (salted,
truncated, one-way). Uninstalling and reconnecting the same Vault yields the
same pseudonym; connecting a different Vault yields a different one.

## Referral / source attribution

A campaign link — `https://aifinpay-wallet-chatgpt.onrender.com/?src=casper-community`
— sets a 30-day first-party cookie. When the same browser later approves the
OAuth connection or pairs a Vault, that referral is attached to the user (first
touch wins). Give each community/campaign its own `?src=` value. Attribution is
best-effort by design: a user who installs on a different device than the one
that clicked the link counts as `organic`.

## Retention and privacy rules

- Raw `analytics_events`: **180 days**, pruned daily by the server.
- `analytics_users` and dashboard aggregates: kept (contain nothing sensitive).
- Never collected: private keys, phrases, passwords, IPs, wallet addresses,
  message contents, ChatGPT conversation data.
- The salt lives only in `SESSION_SECRET` derivation; rotating that secret
  orphans old pseudonyms rather than exposing them.

## Dashboard access

- `GET /internal/analytics` (HTML) and `GET /internal/analytics.json` (raw).
- Auth: `ANALYTICS_DASHBOARD_TOKEN` env var (min 16 chars). Send as
  `Authorization: Bearer <token>` or `?token=<token>`. If the env var is not
  set the routes return 404 — the dashboard is off by default.
- Shows: connected Vaults, unique users, DAU/WAU, transfers by status and
  network (authoritative), wallet-open → completed-transaction conversion,
  platform and widget-version breakdowns, stage errors, referrals, and the
  `casper-community` slice.

## Fees on ordinary wallet transfers — verified 6 Aug 2026

**The wallet charges no AiFinPay fee.** Confirmed in code: `PaymentService`
moves exactly the requested `amountBaseUnits`; the adapters build native
transfers of exactly that amount; every fee mentioned in the codebase is the
network's own (Casper's standard 0.1 CSPR payment, NEAR gas reserve, Aptos gas,
EVM gas). There is no AIFP-1 1% protocol-fee code path in the GPT wallet — the
protocol fee exists in the AiFinPay settlement contracts, which ordinary wallet
transfers do not touch.
