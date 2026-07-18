const REPOSITORY_URL = "https://github.com/coinsecuritiescompany/GPT-wallet-AiFinPay";
const SUPPORT_URL = `${REPOSITORY_URL}/issues`;

function page(title: string, description: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07110f; color: #eefbf5; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 15% 0%, #153b31 0, #07110f 42rem); }
    main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 64px 0; }
    .badge { display: inline-flex; padding: 6px 10px; border: 1px solid #2b6655; border-radius: 999px; color: #8ef0c6; font-size: 13px; }
    h1 { margin: 18px 0 12px; font-size: clamp(34px, 7vw, 64px); line-height: 1.02; letter-spacing: -0.045em; }
    h2 { margin-top: 38px; font-size: 21px; }
    p, li { color: #bad0c7; line-height: 1.65; }
    strong { color: #eefbf5; }
    a { color: #8ef0c6; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0 34px; }
    .button { padding: 11px 16px; border-radius: 10px; background: #74e6b7; color: #07110f; font-weight: 750; text-decoration: none; }
    .button.secondary { background: transparent; color: #a9f4d4; border: 1px solid #2b6655; }
    .notice { padding: 16px; border: 1px solid #7c5b24; border-radius: 12px; background: #261c0c; color: #f5dba8; }
    code { padding: 2px 6px; border-radius: 6px; background: #10221d; color: #b6f5dc; }
    footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #173128; color: #7d9b90; font-size: 13px; }
  </style>
</head>
<body><main>${content}<footer>AiFinPay Wallet for ChatGPT · demo/testnet only · <a href="/privacy">Privacy</a> · <a href="/support">Support</a></footer></main></body>
</html>`;
}

export function landingPage(mcpUrl: string): string {
  return page("AiFinPay Wallet for ChatGPT", "Programmable demo wallet and approval layer for users and AI agents.", `
    <span class="badge">MCP App · demo/testnet</span>
    <h1>Wallet controls, inside the conversation.</h1>
    <p>AiFinPay gives ChatGPT focused tools for balances, transfer previews, explicit approvals, agent spending limits, receipts and a tamper-evident audit trail.</p>
    <div class="notice"><strong>No real funds.</strong> This public deployment uses a deterministic demo ledger and does not request, store or expose seed phrases or private keys.</div>
    <div class="actions">
      <a class="button" href="/preview">Open widget preview</a>
      <a class="button secondary" href="${REPOSITORY_URL}">View source</a>
    </div>
    <h2>ChatGPT connection</h2>
    <p>Enable Developer mode, create a developer-mode app and use this MCP endpoint:</p>
    <p><code>${mcpUrl}</code></p>
    <h2>Safety boundary</h2>
    <p>Transfers follow a prepare → confirm → execute state machine. Agent requests are evaluated by deterministic policies; the model cannot override blocked or approval-required outcomes.</p>
  `);
}

export function privacyPage(): string {
  return page("Privacy · AiFinPay Wallet", "Privacy notice for the AiFinPay Wallet public demo.", `
    <span class="badge">Effective July 18, 2026</span>
    <h1>Privacy notice</h1>
    <p>This notice applies to the public AiFinPay Wallet for ChatGPT demo. It is a technical demonstration, not a production custody service.</p>
    <h2>Data processed</h2>
    <p>The demo may process generated wallet identifiers, token balances, recipient addresses, transfer amounts, payment-intent status, agent policies, idempotency identifiers and audit events needed to perform the requested demo flows.</p>
    <h2>Data we do not request</h2>
    <p>Do not provide real private keys, seed phrases, passwords or personal financial information. The app has no UI or tool input for seed phrases or private keys.</p>
    <h2>Purpose and storage</h2>
    <p>Data is used only to operate, secure and debug the demo. State is stored in the deployment's SQLite database and may be reset at any time. Server logs are designed to exclude confirmation tokens and secrets.</p>
    <h2>Sharing and sale</h2>
    <p>The demo does not sell personal data. Infrastructure providers may process limited technical data to host and protect the service. No real blockchain transaction is submitted.</p>
    <h2>Your choices</h2>
    <p>Do not use the demo if you do not want its inputs stored temporarily. To request deletion of demo data or report a privacy issue, open a private-data-free support ticket and ask for a secure follow-up channel.</p>
    <p><a class="button secondary" href="${SUPPORT_URL}">Contact support</a></p>
  `);
}

export function supportPage(): string {
  return page("Support · AiFinPay Wallet", "Support information for the AiFinPay Wallet public demo.", `
    <span class="badge">Open-source demo support</span>
    <h1>Support</h1>
    <p>For bugs, connection failures or security concerns, use the repository issue tracker. Include the route, approximate time and a redacted error message.</p>
    <div class="notice"><strong>Never post</strong> seed phrases, private keys, API keys, confirmation tokens, access tokens or real personal financial data.</div>
    <div class="actions">
      <a class="button" href="${SUPPORT_URL}">Open GitHub Issues</a>
      <a class="button secondary" href="/health">Check service health</a>
    </div>
    <h2>Known demo limitations</h2>
    <p>The ledger is deterministic, explorer links are illustrative, OAuth is not enabled and state may be reset by a redeploy. Production signing and real-chain submission are intentionally disabled.</p>
  `);
}
