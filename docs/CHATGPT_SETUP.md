# ChatGPT setup

## Hosted reviewer flow

1. In ChatGPT, open **Settings → Security and login** and turn on **Developer mode**. Availability can depend on the reviewer account or workspace policy.
2. Open **ChatGPT Plugins**, select **+**, enter `AiFinPay Wallet` as the user-facing name, and use this public streamable-HTTP MCP endpoint under **Connection**:

   `https://aifinpay-wallet-chatgpt.onrender.com/mcp`

3. Create the connection and review the discovered tools and metadata.
4. Start a **new conversation**, add the AiFinPay MCP connection from the tools menu, and ask: `Open my AiFinPay wallet.`
5. On first use, ChatGPT shows its native OAuth **Connect** action. Continue to the Vault authorization page.
6. Create a disposable Vault or restore a disposable test phrase locally. Do not record the phrase in a screenshot or demo video.
7. Approve sharing the five public chain-family addresses and return to ChatGPT. Passwords, recovery words and keys remain local.
8. Verify that the wallet opens immediately with Casper selected first, then switch networks and open **Receive** to verify the QR code and full public address.

After tool, schema, metadata, authentication or widget URI changes: redeploy, open the connection in **ChatGPT Plugins**, select **Refresh**, confirm the discovered metadata changed, and rerun the tests in a new conversation.

Each newly created Vault gets a fresh random recovery phrase and a new set of public addresses. The same connected ChatGPT user intentionally keeps the same Vault across conversations, so funds remain recoverable. Polygon, Arbitrum and the other EVM networks intentionally share one EVM account address; their balances, chain IDs, smart-contract deployments and transactions remain network-specific.

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
- `Prepare a 1 USDC transfer on Polygon.` — expected: a canonical preview and local Vault signing link when the wallet is funded.

## Review checks

- `/health` reports `walletMode: mainnet` and `blockchainAdapter: MAINNET`.
- The widget badge says `MAINNET`, not Amoy or Demo.
- Balance data corresponds to the OAuth-linked address for the selected network.
- Casper is first in the network registry and matches the public `AiFinPay/casper-contract` mainnet deployment.
- Switching Polygon to Arbitrum changes the selected chain and balance request while retaining the same EVM account address by design.
- Recovery words never appear in ChatGPT tool input/output.
- Send is available only on runtime signing-enabled EVM networks and always requires a separate local Vault review/signing step.
- Privacy, terms and support URLs are public.

Official references: [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt), [Prepare an app](https://developers.openai.com/apps-sdk/deploy/submission), [Security and privacy](https://developers.openai.com/apps-sdk/guides/security-privacy).
