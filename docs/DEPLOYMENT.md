# Deployment

Verified public reference deployment: `https://aifinpay-wallet-chatgpt.onrender.com/`

Public MCP endpoint: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

## Render Blueprint

Use the README button or:

`https://render.com/deploy?repo=https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`

The Blueprint builds the Docker image, configures `/health`, enables automatic deploys and selects Polygon mainnet read mode. Render supplies the public hostname, which the server uses for MCP, widget, Vault and legal URLs.

Verify after every deploy:

```text
GET /health
walletMode: mainnet
blockchainAdapter: MAINNET
```

Also test `/`, `/preview`, `/privacy`, `/terms`, `/support` and `/mcp`.

## Free-tier warning

The included `plan: free` is for evaluation. It can cold-start after inactivity and uses ephemeral `/tmp` storage. OAuth linking survives restarts because the integrity-protected token contains public addresses only, but runtime intents, policies and audit data can disappear. Production requires an always-on instance and durable managed storage.

## Container

```bash
docker build -t aifinpay-wallet .
docker run --rm -p 8787:8787 \
  -e AIFINPAY_WALLET_MODE=mainnet \
  -e AIFINPAY_DEMO_MODE=false \
  -e POLYGON_RPC_URLS="https://polygon.drpc.org,https://polygon.publicnode.com" \
  -e SESSION_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e MCP_PUBLIC_URL="https://wallet.example.com/mcp" \
  -e WIDGET_PUBLIC_URL="https://wallet.example.com" \
  aifinpay-wallet
```

Never expose `AIFINPAY_DEMO_MODE=true` as a shared service: it intentionally uses one test identity. Production-like deployments must use `false`, which requires OAuth 2.1 with PKCE.

## Production gate

Do not enable mainnet sending in this public deployment. Production requires the private authentication, durable data, signing and operational systems described in [Public/private boundary](PUBLIC_PRIVATE_BOUNDARY.md), plus the controls in [Security model](SECURITY_MODEL.md) and [Compliance posture](COMPLIANCE.md).
