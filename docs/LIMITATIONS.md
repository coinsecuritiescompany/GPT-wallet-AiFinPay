# Known limitations

- Native-token balances are read across all 13 mainnet networks; USDC is read on the 6 EVM chains with a verified Circle contract (Polygon, Avalanche, Arbitrum, BNB, Base and Optimism).
- Casper (the 13th network) reads native CSPR via the `query_balance` JSON-RPC method. Mainnet Casper nodes are API-key gated, so a working `CASPER_RPC_URLS` node plus `CASPER_RPC_AUTH` provider key must be configured; without them CSPR reads are unavailable while every other network still works. An unfunded Casper account (no main purse yet) resolves to a zero balance rather than an error.
- EVM transfers can be enabled per network. The checked-in production Blueprint enables Polygon only; the other EVM networks remain balance-only until their signing paths complete release QA. Solana, NEAR, Aptos and Casper transfers are not implemented.
- Cross-chain swaps use ChangeNOW's non-custodial standard flow and require a private `CHANGENOW_API_KEY`. Quotes, orders and status checks fail closed when the key is absent. The app never invents a rate.
- A Polygon-source swap can hand the exact provider deposit into the reviewed local Vault transfer flow. Casper-source orders show the exact amount, QR and deposit address, but CSPR must currently be sent with an external Casper signer because native Casper transaction signing has not completed the release audit.
- Swap availability, minimums, rates and supported pairs are controlled by the provider. Output is estimated until the provider receives the deposit. Users must complete provider/legal eligibility checks applicable to their jurisdiction.
- Transaction history is best-effort and currently limited to Polygon. It requires an Etherscan API key or a compatible Blockscout service and is not a source of record.
- Personal OAuth 2.1 with PKCE is implemented. Refresh-token revocation is still secret-rotation based rather than backed by a durable per-token revocation list.
- The production Blueprint uses an always-on Render service and a persistent disk. Existing deployments must be updated to that Blueprint; SQLite remains a single-instance store and still needs tested backups and restore procedures.
- Browser local storage is not a hardware wallet or secure enclave.
- The nine EVM networks share one derived EVM address by design; Solana, NEAR, Aptos and Casper each read their own derived address.
- USDC is not read on Unichain, BOT Chain or XRPL EVM (no verified canonical USDC contract) or on the non-EVM networks (Solana, NEAR, Aptos, Casper); those show native balances only.
- Agent policies are enforced by deterministic server code, but the local SQLite policy and audit store is not a regulated or externally anchored system of record.
- A prepared EVM transaction is revalidated against the exact locally signed transaction before broadcast. Full transaction simulation, confirmation monitoring and replacement/cancellation UX are still required.
- No external smart-contract, cryptographic or application-security audit has been completed.
- No production regulatory, AML/sanctions, consumer-protection or jurisdictional approval is claimed.
- Accessibility and multi-device recovery require additional manual QA.
