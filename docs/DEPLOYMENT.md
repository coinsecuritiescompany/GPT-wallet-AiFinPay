# Deployment

Verified public reference deployment: `https://aifinpay-wallet-chatgpt.onrender.com/`

Public MCP endpoint: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

## Current hosted-service reality

The connected service was inspected on July 31, 2026:

- Render service ID: `srv-d9dj0bjrjlhs73anpb1g`;
- branch: `main`;
- region: Oregon;
- runtime plan: Free;
- auto-deploy: disabled;
- one instance;
- health check: `/health`;
- the service details returned by Render do not show the persistent disk declared in `render.yaml`.

The repository Blueprint is the intended production topology, but the connected service does not automatically inherit it. Before advertising an always-on production wallet, move the public endpoint to a paid instance, attach and verify the `/var/data` disk, test backup/restore, and preferably use Frankfurt for the current European audience.

Warm `/health` requests observed from the audit environment still took about 4–7 seconds to first byte, and a full MCP initialize/list/read sequence took materially longer. The server compresses the single-file widget response, but application code cannot remove Render Free scheduling/network latency. Measure p50/p95 latency from ChatGPT again after the infrastructure migration.

## Render Blueprint

Use the README button or:

`https://render.com/deploy?repo=https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`

The Blueprint describes:

- Starter plan;
- automatic deploys;
- persistent disk mounted at `/var/data`;
- mainnet wallet mode;
- direct local signing on Polygon, Avalanche, Arbitrum, BNB Chain, Base, Unichain and Optimism;
- BOT Chain and XRPL EVM send-locked pending live fee/broadcast proof;
- Solana, NEAR, Aptos and Casper receive-only until chain-specific signers are implemented.

Direct wallet transfers are separate from AIFP contract settlement. Enabling Optimism direct ETH/USDC transfers does not enable the legacy Optimism splitter, whose stablecoin constants are unsafe according to the private network source of truth.

Render supplies the public hostname, which the server uses for MCP, widget, Vault and legal URLs. Add `CHANGENOW_API_KEY` as a secret to enable live swap quotes and orders.

Verify after every deploy:

```text
GET /health
walletMode: mainnet
blockchainAdapter: MAINNET
database: ok
swapProvider: configured
```

Also test `/`, `/preview`, `/privacy`, `/terms`, `/support` and `/mcp`.

For each release, record cold and warm time-to-first-byte for `/health`, MCP initialization, `tools/list`, the open-wallet tool and the widget resource. A successful HTTP 200 with multi-second latency is not sufficient for the ChatGPT mobile experience.

## Direct-transfer release gate

`AIFINPAY_SIGNING_NETWORKS` is a comma-separated allowlist. The production Blueprint uses:

```text
POLYGON,AVALANCHE,ARBITRUM,BNB,BASE,UNICHAIN,OPTIMISM
```

The direct EVM path builds a chain-specific transaction, checks the native gas balance, uses the network-specific USDC address/decimals, signs locally in the Vault, validates the exact reviewed transaction bytes and only then broadcasts.

Before adding another network to this allowlist, add deterministic tests and capture one funded dust transaction with:

1. exact release commit;
2. sender and recipient;
3. chain ID;
4. native and token decimals;
5. fee fields;
6. transaction hash and successful receipt;
7. duplicate, expiry, malformed-signature and insufficient-gas rejection tests.

## Swap secret

The public repository and Docker image contain no ChangeNOW credential. `render.yaml` declares only a `sync: false` secret slot.

1. Open the Render service.
2. Go to **Environment**.
3. Add `CHANGENOW_API_KEY` as a secret environment variable.
4. Paste the current partner key directly in Render.
5. Save and redeploy.
6. Confirm `/health` returns `swapProvider: "configured"`. The key itself is never returned.

Rotate the key immediately if it appears in chat, source control, screenshots, logs or support messages.

## Persistent runtime state

The checked-in Blueprint uses `/var/data/aifinpay-runtime.sqlite` on a persistent Render disk. Apply that topology to the actual public service before treating wallet connections, policies, payment intents or the audit chain as durable records. Configure external backups and test restoration.

## Container

```bash
docker build -t aifinpay-wallet .
docker run --rm -p 8787:8787 \
  -e AIFINPAY_WALLET_MODE=mainnet \
  -e AIFINPAY_DEMO_MODE=false \
  -e AIFINPAY_SIGNING_NETWORKS=POLYGON,AVALANCHE,ARBITRUM,BNB,BASE,UNICHAIN,OPTIMISM \
  -e DATABASE_URL=/var/data/aifinpay-runtime.sqlite \
  -e POLYGON_RPC_URLS="https://polygon.drpc.org,https://polygon.publicnode.com" \
  -e CHANGENOW_API_KEY="replace-with-a-server-side-partner-key" \
  -e SESSION_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e MCP_PUBLIC_URL="https://wallet.example.com/mcp" \
  -e WIDGET_PUBLIC_URL="https://wallet.example.com" \
  aifinpay-wallet
```

Never expose `AIFINPAY_DEMO_MODE=true` as a shared service: it intentionally uses one test identity. Production-like deployments must use `false`, which requires OAuth 2.1 with PKCE.

## Release statement

The truthful current statement is:

> AiFinPay Wallet supports non-custodial receive and live balances across 13 mainnets, with locally signed direct transfers on seven EVM networks. Solana, NEAR, Aptos and Casper remain receive-only until their chain-specific signers pass production tests. AIFP settlement readiness is tracked separately.

Do not claim full 13-network sending or complete AIFP paid end-to-end settlement yet. The full audit is in [PRODUCTION_AUDIT_2026-07-31.md](PRODUCTION_AUDIT_2026-07-31.md).
