# Mainnet deployment registry

This document records public AiFinPay deployment identifiers supplied by the project owner. It contains no private keys, recovery phrases, OAuth secrets, RPC credentials, treasury credentials or signing material.

> Status: `DEPLOYED_UNVERIFIED`. Live RPC checks on 2026-07-18 confirmed EVM bytecode at all nine EVM addresses, an executable Solana program, a nonzero NEAR code hash and the Aptos `splitter` module ABI. Casper identifiers below are cross-checked against the public [`AiFinPay/casper-contract`](https://github.com/AiFinPay/casper-contract) mainnet deployment record, including its install deploy and published real-value settlement evidence. The wallet still does not enable mainnet signing merely because code is present: bytecode/source equivalence, ABI or IDL, proxy implementation, admin and pause roles, supported tokens, treasury destinations and test vectors must pass an independent release gate first.

Operational note: the owner-supplied `https://polygon-rpc.com` endpoint returned `tenant disabled` during verification. The registry uses `https://polygon.drpc.org`, the current endpoint listed in Polygon's developer documentation and already configured as the wallet's primary Polygon read provider.

## RPC verification snapshot — 2026-07-18

- Casper's public project record identifies contract `9903a5e3…f019`, package `7ad34a20…a375` and install deploy `0d560c62…0386` on Casper 2.0 mainnet. The wallet uses `query_balance` for CSPR reads; the configured cspr.cloud node requires a server-side `CASPER_RPC_AUTH` value.
- Polygon, Avalanche, Arbitrum, BNB Chain, Base and Unichain returned 10,637 bytes of `AiFinPayCore` bytecode on their expected chain IDs. Their bytecode hashes are not identical, so release equivalence still needs build-artifact and immutable/configuration review.
- Optimism and XRPL EVM returned identical 2,866-byte `B2BSplitter` bytecode.
- BOT Chain returned 3,704 bytes of `B2BSplitter` bytecode. This differs from the Optimism/XRPL EVM deployment and must be treated as a separate contract version during review.
- Solana returned an executable upgradeable-BPF program account.
- NEAR returned a nonzero contract `code_hash`.
- Aptos returned the `splitter` module bytecode and public ABI, including `pay`, fee, treasury, pause and ownership functions.

These checks confirm code presence, not business-logic correctness, ownership safety or source-code equivalence.

| Network | Chain ID | Deployment | Public identifier | RPC | Explorer |
|---|---:|---|---|---|---|
| Casper | — | Contract (package `hash-7ad34a204952eef63d5dcf5159fb7d009e85dea4f49cbdf73dde190652dfa375`) | `9903a5e3948e799196df54b17270bc6769338ac1cc36c9eb47e113f88d23f019` | `https://node.mainnet.cspr.cloud/rpc` (Authorization required) | `https://cspr.live/contract/9903a5e3948e799196df54b17270bc6769338ac1cc36c9eb47e113f88d23f019` |
| Polygon | 137 | AiFinPayCore | `0x1071Bb1C827223D3D0115B0e1f114adAb9ceB94f` | `https://polygon.drpc.org` | `https://polygonscan.com` |
| Avalanche C-Chain | 43114 | AiFinPayCore | `0x147d8ff8c027e24303b5b99cbc8843e1d3df94cc` | `https://api.avax.network/ext/bc/C/rpc` | `https://snowtrace.io` |
| Arbitrum One | 42161 | AiFinPayCore | `0x147d8ff8c027e24303b5b99cbc8843e1d3df94cc` | `https://arb1.arbitrum.io/rpc` | `https://arbiscan.io` |
| BNB Chain | 56 | AiFinPayCore | `0x29e7519C653E1b383e8Be74675666bbA51bAb542` | `https://bsc-dataseed.binance.org` | `https://bscscan.com` |
| Base | 8453 | AiFinPayCore | `0xF03B3387415D557b6ab709D06E8aF0b4ABD6Eb74` | `https://mainnet.base.org` | `https://basescan.org` |
| Unichain | 130 | AiFinPayCore | `0x493dc0e34f13b2fd50bab7156d3850f3b86c6f53` | `https://mainnet.unichain.org` | `https://uniscan.xyz` |
| Optimism | 10 | B2BSplitter | `0xee92807decaa3a02f1e165dd7efcd92ab9aa83cb` | `https://mainnet.optimism.io` | `https://optimistic.etherscan.io` |
| BOT Chain | 677 | B2BSplitter | `0x271870ABb6e6756D97191eBdb27C1873911bb587` | `https://rpc.botchain.ai` | `https://scan.botchain.ai` |
| XRPL EVM | 1440000 | B2BSplitter | `0xeE92807decAa3A02F1e165dd7Efcd92ab9aA83CB` | `https://rpc.xrplevm.org` | `https://explorer.xrplevm.org` |
| Solana | — | Program | `5g9zWHF1Vv6GiGpA2ZbJQbSCDZd5hAk9AyvabRJvKFx2` | `https://api.mainnet-beta.solana.com` | `https://solscan.io` |
| NEAR | — | Contract | `548178623b44c06b5312a415f260e5fe2a2a7c5cc5704b19cbee1d094e7b78eb` | `https://rpc.mainnet.near.org` | `https://nearblocks.io` |
| Aptos | 1 | Module `splitter` | `0xc5feda4075a4f138a5b4e293a8bd41b9e37b76e5553ff35ee6131f4f046d27fd` | `https://fullnode.mainnet.aptoslabs.com/v1` | `https://explorer.aptoslabs.com` |

## Release gate for real-value sending

1. Capture deployment transaction hashes and immutable build inputs.
2. Verify source code and compiler settings on every explorer that supports verification.
3. Compare deployed bytecode hashes against approved release artifacts.
4. Resolve every proxy implementation and verify upgrade/admin/pause roles.
5. Publish reviewed ABI/IDL/module interfaces and canonical transaction builders.
6. Verify supported token contracts, decimals, recipient/treasury addresses and fee rules per network.
7. Add OAuth user identity, durable authorization state, transaction simulation and explicit user approval.
8. Sign only inside the local Vault; never transmit a seed phrase or private key to ChatGPT or the MCP server.
9. Run test-value transfers and independent security review before changing `enabledForSigning`.
