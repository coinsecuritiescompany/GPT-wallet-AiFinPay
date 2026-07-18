# Known limitations

- Deterministic demo ledger only; no real Polygon Amoy broadcast occurs.
- Explorer hashes are deterministic demo identifiers.
- Real AiFinPay code was unavailable in this empty repository, so no production components were reused.
- Demo authentication uses one fixed server-side user. OAuth 2.1/account linking is pending.
- Policy update/revoke confirmation is a strict boolean gate; production should use the same signed user-presence flow as transfers.
- Daily spending currently uses a zero demo accumulator. Production must aggregate completed transactions in a database transaction.
- Demo adapter state is process-local, while payment/audit metadata persists in SQLite. Restart resets demo balances and sample history.
- Node's built-in SQLite API is marked experimental.
- No HSM, MPC, WalletConnect or production signing adapter is included.
- No live RPC, gas estimation, transaction simulation, reorg handling or confirmation monitor exists.
- No rate limiter or distributed replay cache exists.
- Final hosted ChatGPT screenshots, production URL, privacy policy URL, support URL and demo video are pending.
- External security audit and accessibility/manual host QA are pending.

