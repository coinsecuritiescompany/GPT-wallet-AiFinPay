# ChatGPT setup

These steps follow the official Apps SDK docs checked on 2026-07-18. Product labels can change; if a label differs, use the current developer-mode app creation flow linked below rather than guessing.

1. Install and verify:

   ```bash
   npm install
   cp .env.example .env
   npm run check
   npm start
   ```

2. Verify `http://localhost:8787/health` and test tools:

   ```bash
   npx @modelcontextprotocol/inspector@latest --server-url http://localhost:8787/mcp --transport http
   ```

3. For local iteration, expose port 8787 through an HTTPS tunnel, for example:

   ```bash
   ngrok http 8787
   ```

   The stable public demo is available at `https://aifinpay-wallet-chatgpt.onrender.com/mcp`. The README's **Deploy to Render** button creates an independent copy if needed.

4. Open ChatGPT settings and enable Developer mode under **Settings → Security and login**.
5. Open **Settings → Plugins** (or the current plugins page), create a developer-mode app and paste `https://YOUR-TUNNEL.example/mcp`.
6. Use prompts:
   - “Open my AiFinPay wallet.”
   - “What is my USDC balance?”
   - “Send 10 USDC to 0x2222222222222222222222222222222222222222 on Polygon.”
   - “Buy access to demo-data-api for no more than 0.10 USDC with my research agent.”
   - “Try to pay 0.51 USDC with my research agent.”
   - “Show my latest AiFinPay transactions.”
7. After changing tool names, schemas, descriptions or metadata, redeploy/restart and use **Refresh** on the developer-mode app.
8. Inspect MCP Inspector or server JSON logs for tool errors. Check browser developer tools for CSP or widget errors.
9. Verify the widget makes no direct network calls; CSP connect/resource arrays are empty and only Polygon Amoy is allowed as an external redirect.
10. Before submission, replace the tunnel with a stable HTTPS origin. Render is detected automatically; on other hosts set `MCP_PUBLIC_URL` and `WIDGET_PUBLIC_URL` to the deployed origin.

Official references: [Quickstart](https://developers.openai.com/apps-sdk/quickstart), [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt), [Troubleshooting](https://developers.openai.com/apps-sdk/deploy/troubleshooting).
