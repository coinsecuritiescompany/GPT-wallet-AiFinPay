# Deployment

Current verified public demo: `https://aifinpay-wallet-chatgpt.onrender.com/`

Public MCP endpoint: `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

## One-click Render demo

Use the repository's **Deploy to Render** button or open:

`https://render.com/deploy?repo=https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay`

The root `render.yaml` creates a free Docker web service, generates `SESSION_SECRET`, enables demo mode and checks `/health`. The server reads Render's automatic `RENDER_EXTERNAL_HOSTNAME`, so no manual public URL interpolation is needed.

After the first deploy, verify these routes using the hostname shown by Render:

```text
https://<service>.onrender.com/
https://<service>.onrender.com/health
https://<service>.onrender.com/preview
https://<service>.onrender.com/privacy
https://<service>.onrender.com/support
https://<service>.onrender.com/mcp
```

The free Blueprint stores SQLite under `/tmp`; demo state can reset on restart or redeploy. That is intentional for the public non-custodial demo. Choose a paid service with a mounted disk only when stable demo state is required.

## Container

```bash
docker build -t aifinpay-wallet .
docker run --rm -p 8787:8787 \
  -e AIFINPAY_DEMO_MODE=true \
  -e SESSION_SECRET="replace-with-a-random-32-plus-character-secret" \
  -e MCP_PUBLIC_URL="https://wallet.example.com/mcp" \
  -e WIDGET_PUBLIC_URL="https://wallet.example.com" \
  -v aifinpay-data:/app/data \
  aifinpay-wallet
```

## Railway, Render or Fly.io

- Deploy the repository with the included Dockerfile.
- Expose port `8787` and configure `/health` as the health check.
- Set the variables above in the host secret manager.
- Mount persistent storage at `/app/data` for the demo database.
- Confirm HTTPS and streaming POST support on `/mcp`.
- Re-test with MCP Inspector and ChatGPT Developer Mode.

For Render specifically, `RENDER_EXTERNAL_HOSTNAME` is detected automatically. On another host, set `MCP_PUBLIC_URL` and `WIDGET_PUBLIC_URL` explicitly.

## Database

SQLite is adequate for the single-instance hackathon demo. Multiple replicas require managed Postgres, migrations, unique idempotency constraints and transaction-level locking.

## Production gate

Do not set `AIFINPAY_DEMO_MODE=false` until OAuth, a real backend adapter, a reviewed signing design and a real chain adapter are implemented. The current non-demo auth path deliberately returns `AUTH_REQUIRED`.

## Submission

The final public MCP origin must be stable HTTPS. This server publishes `/privacy` and `/support` on the same origin. Configure a unique widget/app domain and capture hosted screenshots, then scan the deployed endpoint in the plugin submission portal; tool metadata is versioned at scan time.
