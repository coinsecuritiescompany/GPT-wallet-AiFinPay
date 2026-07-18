# ChatGPT setup

## Hosted reviewer flow

1. Open ChatGPT settings and enable Developer Mode.
2. Create or refresh a developer-mode app using:

   `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

3. Ask: `Open my AiFinPay wallet.`
4. If not connected, open the generated short-lived Vault URL.
5. Create a disposable Vault or restore a disposable test phrase locally. Do not record the phrase in a screenshot or demo video.
6. Pair public addresses and return to ChatGPT.
7. Reopen the wallet and verify Polygon Mainnet POL/USDC balances.

After tool, schema, metadata or widget URI changes, redeploy and refresh the app in ChatGPT.

## Local development

```bash
npm ci
cp .env.example .env
npm run check
npm start
npx @modelcontextprotocol/inspector@latest --server-url http://localhost:8787/mcp --transport http
```

Expose port `8787` through a temporary HTTPS tunnel only for development. Production/submission review must use a stable public HTTPS endpoint.

## Test prompts

- `Open my AiFinPay wallet.`
- `Connect a new AiFinPay Vault.`
- `What is my POL balance on Polygon?`
- `Show my receive addresses.`
- `Which mainnet networks does my Vault support?`
- `Prepare a 1 USDC mainnet transfer.` — expected: safe signing-disabled response.

## Review checks

- `/health` reports `walletMode: mainnet` and `blockchainAdapter: MAINNET`.
- The widget badge says `MAINNET`, not Amoy or Demo.
- Balance data corresponds to the paired public Polygon address.
- Recovery words never appear in ChatGPT tool input/output.
- Send presents the security gate and never broadcasts.
- Privacy, terms and support URLs are public.

Official references: [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt), [Prepare an app](https://developers.openai.com/apps-sdk/deploy/submission), [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy).
