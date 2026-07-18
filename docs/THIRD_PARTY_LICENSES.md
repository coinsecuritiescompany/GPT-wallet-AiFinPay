# Third-party licenses

AiFinPay Wallet for ChatGPT is licensed under MIT. Dependencies remain licensed by their respective authors.

Primary runtime components include:

| Component | Purpose | Declared license |
|---|---|---|
| React / React DOM | Widget user interface | MIT |
| Model Context Protocol SDK | MCP server transport and types | MIT |
| MCP Ext Apps | MCP App resource and bridge support | MIT |
| Zod | Runtime schema validation | MIT |
| Vite | Widget build tooling | MIT |
| Noble Curves / Hashes | Browser cryptographic primitives | MIT |
| Scure BIP-32 / BIP-39 | Wallet derivation and recovery words | MIT |
| viem | EVM address derivation utilities | MIT |
| bs58 | Base58 address encoding | MIT |

Exact versions and transitive dependency metadata are pinned in `package-lock.json`. Before distributing a release, maintainers must regenerate the dependency inventory, review license changes and preserve any notices required by dependency licenses.

No third-party trademark license or endorsement is implied. OpenAI, Polygon, Circle, Stripe, PayPal and Visa names belong to their respective owners.
