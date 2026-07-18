# Known limitations

- Polygon mainnet POL and native USDC balances are live but read-only.
- Mainnet transfer preparation, signing and broadcasting are disabled.
- Transaction history is empty in mainnet mode until an indexed provider is integrated.
- The hosted beta uses one temporary server-side session instead of personal OAuth.
- Render Free can cold-start after inactivity and its SQLite filesystem is ephemeral.
- Pairing must be repeated after storage loss, restart or redeploy.
- Browser local storage is not a hardware wallet or secure enclave.
- EVM addresses are reused across nine EVM networks by derivation design; only Polygon reads are live.
- Solana, NEAR and Aptos addresses are derived, but balances and signing are not connected.
- Agent policies and the deterministic ledger are reference/demo functionality, not production authorization.
- No external smart-contract, cryptographic or application-security audit has been completed.
- No production regulatory, AML/sanctions, consumer-protection or jurisdictional approval is claimed.
- Accessibility and multi-device recovery require additional manual QA.
