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
    .app-logo { display: block; width: 72px; height: 72px; margin-bottom: 20px; border-radius: 18px; }
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
<body><main>${content}<footer>AiFinPay Wallet for ChatGPT · Non-custodial mainnet beta · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/support">Support</a></footer></main></body>
</html>`;
}

export function landingPage(mcpUrl: string): string {
  return page("AiFinPay Wallet for ChatGPT", "Non-custodial multichain wallet interface for users and AI agents.", `
    <img class="app-logo" src="/icon.png" alt="AiFinPay logo" width="72" height="72">
    <span class="badge">MCP App · 13 mainnets</span>
    <h1>Wallet controls, inside the conversation.</h1>
    <p>AiFinPay gives ChatGPT focused tools for balances, transfer previews, explicit approvals, agent spending limits, receipts and a tamper-evident audit trail.</p>
    <div class="notice"><strong>Real mainnet data.</strong> The wallet reads public balances across 13 networks. Transfers are offered only on networks explicitly marked as signing-enabled and always require review plus local Vault signing.</div>
    <div class="actions">
      <a class="button" href="/preview">Open widget preview</a>
      <a class="button secondary" href="${REPOSITORY_URL}">View source</a>
    </div>
    <h2>ChatGPT connection</h2>
    <p>Enable Developer mode, create a developer-mode app and use this MCP endpoint:</p>
    <p><code>${mcpUrl}</code></p>
    <h2>Safety boundary</h2>
    <p>Recovery phrases and private keys stay inside the user's encrypted local Vault. The server receives public addresses only.</p>
  `);
}

export function privacyPage(): string {
  return page("Privacy · AiFinPay Wallet", "Privacy notice for the AiFinPay Wallet mainnet read-only beta.", `
    <span class="badge">Effective July 30, 2026</span>
    <h1>Privacy notice</h1>
    <p>This notice applies to the public AiFinPay Wallet for ChatGPT beta. It is non-custodial and is not a custody or exchange service.</p>
    <h2>Data processed</h2>
    <p>The beta processes public wallet addresses and publicly available blockchain balance and transaction data, plus OAuth authorization, payment-intent, policy and audit metadata needed to operate the requested flow. A user-requested swap sends the selected public payout/refund addresses, asset pair and amount to ChangeNOW.</p>
    <h2>Data we do not request</h2>
    <p>MCP tools never request private keys, recovery words or Vault passwords. The separate Vault page can generate or accept recovery words locally in the browser; those words and the password are not intentionally transmitted to AiFinPay or ChatGPT.</p>
    <h2>Purpose and storage</h2>
    <p>Data is used only to operate, secure and debug the beta. OAuth access and refresh tokens contain public addresses only and are integrity-protected; recovery material and passwords are excluded. Production metadata is stored on the service's persistent encrypted infrastructure volume. Server logs are designed to exclude authorization codes and tokens.</p>
    <h2>Sharing and sale</h2>
    <p>AiFinPay does not sell personal data. Hosting, indexing, RPC and optional swap providers may process limited technical or transaction data to provide their respective services. On an enabled network, the broadcast service receives only the raw transaction that the user signed locally.</p>
    <h2>Your choices</h2>
    <p>Disconnect the app in ChatGPT to remove its authorization. To request deletion of runtime metadata or report a privacy issue, open a private-data-free support ticket and ask for a secure follow-up channel.</p>
    <p><a class="button secondary" href="${SUPPORT_URL}">Contact support</a></p>
  `);
}

export function termsPage(): string {
  return page("Terms · AiFinPay Wallet", "Public beta terms for the AiFinPay Wallet non-custodial mainnet interface.", `
    <span class="badge">Effective July 30, 2026</span>
    <h1>Public beta terms</h1>
    <p>This experimental service is provided for evaluation and controlled testing. It can change or become unavailable without notice.</p>
    <h2>No custody or financial service</h2>
    <p>The intended flow keeps recovery material on the user's device. AiFinPay does not itself provide custody, exchange, brokerage, investment advice, banking or securities services. When enabled, swaps are routed to ChangeNOW under its availability, eligibility, pricing and terms. On enabled networks, the user signs each transaction locally and the service relays only the resulting raw signed transaction.</p>
    <h2>User responsibility</h2>
    <p>Protect recovery material, verify the network, asset, amount, recipient and maximum fee before signing, and start with a small test transfer. Blockchain transactions are generally irreversible. Never fund a wallet whose recovery phrase has been disclosed. Do not use the beta for unlawful activity or attempt to bypass security controls.</p>
    <h2>No warranty</h2>
    <p>The service and source are provided as is, without warranties. Public-chain and RPC information may be delayed, incomplete or unavailable. Swap quotes are estimates and provider execution is not guaranteed.</p>
    <h2>Open-source license</h2>
    <p>Repository source is governed by the MIT License. The software license is not a regulatory authorization or financial-services license.</p>
    <p><a class="button secondary" href="${REPOSITORY_URL}/blob/main/TERMS.md">Read repository terms</a></p>
  `);
}

export function supportPage(): string {
  return page("Support · AiFinPay Wallet", "Support information for the AiFinPay Wallet public beta.", `
    <span class="badge">Open-source beta support</span>
    <h1>Support</h1>
    <p>For non-sensitive bugs or connection failures, use the repository issue tracker. Include the route, approximate time and a redacted error message. Report vulnerabilities privately through the repository Security tab.</p>
    <div class="notice"><strong>Never post</strong> seed phrases, private keys, API keys, confirmation tokens, access tokens or real personal financial data.</div>
    <div class="actions">
      <a class="button" href="${SUPPORT_URL}">Open GitHub Issues</a>
      <a class="button secondary" href="${REPOSITORY_URL}/security/advisories/new">Private security report</a>
      <a class="button secondary" href="/health">Check service health</a>
    </div>
    <h2>Known beta limitations</h2>
    <p>Balances and receiving are enabled across 13 mainnets. OAuth 2.1 with PKCE carries public addresses only. Local EVM signing is enabled per network; the deployment labels unsupported networks honestly. Transaction history is currently indexed for Polygon and can be incomplete when external indexers are unavailable.</p>
  `);
}
