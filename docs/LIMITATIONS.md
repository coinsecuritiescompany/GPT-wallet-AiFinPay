# Known limitations

- Native-token balances are read-only across all 13 mainnet networks; USDC is read on the 6 EVM chains with a verified Circle contract (Polygon, Avalanche, Arbitrum, BNB, Base, Optimism).
- Casper (the 13th network) reads native CSPR via the `query_balance` JSON-RPC method. Mainnet Casper nodes are API-key gated, so a working `CASPER_RPC_URLS` node plus `CASPER_RPC_AUTH` provider key must be configured; without them CSPR reads are unavailable while every other network still works. An unfunded Casper account (no main purse yet) resolves to a zero balance rather than an error.
- Mainnet transfer preparation, signing and broadcasting are disabled.
- Transaction history is empty in mainnet mode until an indexed provider is integrated.
- The hosted beta uses one temporary server-side session instead of personal OAuth.
- Render Free can cold-start after inactivity and its SQLite filesystem is ephemeral.
- Pairing must be repeated after storage loss, restart or redeploy.
- Browser local storage is not a hardware wallet or secure enclave.
- The nine EVM networks share one derived EVM address by design; Solana, NEAR, Aptos and Casper each read their own derived address.
- USDC is not read on Unichain, BOT Chain or XRPL EVM (no verified canonical USDC contract) or on the non-EVM networks (Solana, NEAR, Aptos, Casper); those show native balances only.
- Agent policies and the deterministic ledger are reference/demo functionality, not production authorization.
- No external smart-contract, cryptographic or application-security audit has been completed.
- No production regulatory, AML/sanctions, consumer-protection or jurisdictional approval is claimed.
- Accessibility and multi-device recovery require additional manual QA.
