# Three-minute demo script

## 0:00–0:20 — Problem

“AI agents can call tools and APIs, but payments still depend on fragmented interfaces or unsafe unrestricted keys. AiFinPay adds an approval and policy layer inside the conversation.”

## 0:20–0:40 — Open wallet

Say: “Open my AiFinPay wallet.” Show the 2,543.68 USDC demo balance, Polygon Amoy, recent transactions, Agent Limits and Audit Log.

## 0:40–1:20 — Human transfer

Say: “Send 10 USDC to 0x2222222222222222222222222222222222222222 on Polygon.” Show parsed recipient, amount, network, estimated fee, low risk, policy result and explicit Confirm/Cancel controls.

## 1:20–1:45 — Confirm

Click Confirm. Explain that the token is scoped to the prepared intent, user and expiry. Show the deterministic transaction hash, explorer link, receipt ID and audit entry. State clearly that this is a demo ledger.

## 1:45–2:20 — Agent payment

Say: “Buy access to demo-data-api for no more than 0.10 USDC with my research agent.” Show agent identity, 5 USDC daily limit, 0.50 USDC per-transaction limit and automatic approval threshold of 0.10 USDC.

## 2:20–2:40 — Blocked action

Say: “Let my research agent pay 0.51 USDC to the same API.” Show: **Blocked by AiFinPay Policy Engine** and `PER_TRANSACTION_LIMIT_EXCEEDED`.

## 2:40–3:00 — Architecture

Show: ChatGPT → Apps SDK widget → MCP server → AiFinPay policy engine → wallet adapter → demo ledger → audit chain.

End: “Agent-native payments, with humans still in control.”

