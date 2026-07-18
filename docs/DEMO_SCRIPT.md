# Three-minute demo script

The final video must be public on YouTube, three minutes or less, and include English voiceover. Never show recovery words, passwords or live pairing tokens.

## 0:00–0:20 — Problem

“AI agents can call tools and buy services, but giving a model an unrestricted wallet key is unsafe. AiFinPay adds a non-custodial wallet interface, deterministic policy boundary and explicit user control inside ChatGPT.”

## 0:20–0:45 — Open the ChatGPT app

Say: “Open my AiFinPay wallet.” Show the branded inline widget and explain the MCP server/widget architecture. If the server is cold-starting, warm it before recording.

## 0:45–1:20 — Local Vault

Open the Vault creation flow. Show the network selection and explain that recovery is generated locally. Cut or blur the phrase step completely. Show local encryption and the final public-address pairing screen.

## 1:20–1:50 — Live Polygon mainnet data

Return to ChatGPT and reopen the wallet. Show the `MAINNET` badge, paired address, live POL/native USDC balances and Receive view. Explain that only public addresses reach the MCP server.

## 1:50–2:15 — Safety gate

Open Send. Show that mainnet signing is deliberately locked until personal authentication, canonical transaction preview and local signing are complete. Emphasize that the project does not fake successful mainnet transactions.

## 2:15–2:40 — Codex and GPT-5.6

Show a brief Codex/build-log or commit-history view. Explain that Codex created and iterated on the MCP server, UI, tests, mobile bundle split, Polygon adapter and security documentation. Explain that GPT-5.6 interprets requests and selects tools, while deterministic code controls balances and policy.

## 2:40–3:00 — Architecture and impact

Show the README architecture: user → GPT-5.6 → MCP → Polygon RPC, with local Vault ownership. End: “A wallet interface built for AI agents, without giving the model the keys.”
