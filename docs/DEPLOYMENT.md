# Deployment

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

## Database

SQLite is adequate for the single-instance hackathon demo. Multiple replicas require managed Postgres, migrations, unique idempotency constraints and transaction-level locking.

## Production gate

Do not set `AIFINPAY_DEMO_MODE=false` until OAuth, a real backend adapter, a reviewed signing design and a real chain adapter are implemented. The current non-demo auth path deliberately returns `AUTH_REQUIRED`.

## Submission

The public MCP origin cannot be localhost or a tunnel. Configure a unique widget/app domain, public privacy policy, support contact and screenshots. Scan the deployed endpoint in the plugin submission portal; tool metadata is versioned at scan time.

