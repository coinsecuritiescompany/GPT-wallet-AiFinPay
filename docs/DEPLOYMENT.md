# Deployment

Verified public reference deployment: `https://aifinpay-wallet-chatgpt.onrender.com/`

Public MCP endpoint: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

## Current hosted-service reality

The connected service was inspected on July 30, 2026:

- Render service ID: `srv-d9dj0bjrjlhs73anpb1g`;
- branch: `main`;
- region: Oregon;
- runtime plan: Free;
- auto-deploy: disabled;
- one instance;
- health check: `/health`.

Warm `/health` requests observed from the audit environment still took about 4–7 seconds to first byte, and a full MCP initialize/list/read sequence took materially longer. The v14 server compresses the single-file widget response, but application code cannot remove Render Free scheduling/network latency. Before advertising a fast production wallet, move to an always-on paid instance close to the target users (preferably Frankfurt for the current European audience) and measure p50/p95 latency from ChatGPT again. Changing region normally requires a replacement service and a controlled endpoint migration.

## Render Blueprint

Use the README button or:

`https://render.com/deploy?repo=https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`

The Blueprint describes the intended paid service, automatic deploys, persistent disk and Polygon EVM signing. The currently connected service does not automatically inherit those settings merely because `render.yaml` exists: it is Free, auto-deploy is disabled and its actual disk/backup state must be checked in Render. Render supplies the public hostname, which the server uses for MCP, widget, Vault and legal URLs. Add `CHANGENOW_API_KEY` as a secret to enable live swap quotes and orders.

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

The checked-in Blueprint uses an always-on service plus `/var/data/aifinpay-runtime.sqlite` on a persistent Render disk. Apply the Blueprint to the existing service before advertising the product; changing this file alone does not migrate a running Render service. Configure external backups and test restoration before treating policies, intents or the audit chain as records of consequence.

## Container

```bash
docker build -t aifinpay-wallet .
docker run --rm -p 8787:8787 \
  -e AIFINPAY_WALLET_MODE=mainnet \
  -e AIFINPAY_DEMO_MODE=false \
  -e AIFINPAY_SIGNING_NETWORKS=POLYGON \
  -e DATABASE_URL=/var/data/aifinpay-runtime.sqlite \
  -e POLYGON_RPC_URLS="https://polygon.drpc.org,https://polygon.publicnode.com" \
  -e CHANGENOW_API_KEY="replace-with-a-server-side-partner-key" \
  -e SESSION_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e MCP_PUBLIC_URL="https://wallet.example.com/mcp" \
  -e WIDGET_PUBLIC_URL="https://wallet.example.com" \
  aifinpay-wallet
```

Never expose `AIFINPAY_DEMO_MODE=true` as a shared service: it intentionally uses one test identity. Production-like deployments must use `false`, which requires OAuth 2.1 with PKCE.

## Release gate

Keep `AIFINPAY_SIGNING_NETWORKS=POLYGON` until every additional network has its own signed end-to-end test. Do not run advertising that implies audited security, custody, guaranteed execution or regulatory authorization. Complete the operational, security and legal controls in [Security model](SECURITY_MODEL.md) and [Compliance posture](COMPLIANCE.md) first.
