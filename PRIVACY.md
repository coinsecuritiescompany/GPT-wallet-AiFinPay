# Privacy notice

Effective: July 18, 2026

This notice describes the public AiFinPay Wallet for ChatGPT beta and its hosted reference deployment. It is not a production custody, exchange or banking service.

## Data processed locally

The Vault can generate or restore a wallet in the user's browser. Recovery words and the Vault password are used locally to derive addresses and encrypt the Vault with AES-256-GCM. They are not intentionally transmitted to AiFinPay or ChatGPT.

The encrypted Vault is stored in the browser's local storage on that device. Removing browser data or the Vault removes that local copy. AiFinPay cannot recover a lost phrase or password.

## Data sent to the server

When a user explicitly authorizes a Vault, the server receives public EVM, Solana, NEAR and Aptos addresses plus OAuth metadata. Integrity-protected access and refresh tokens contain those public addresses and a pseudonymous wallet identifier; they do not contain recovery material or passwords. The service may also process tool requests, policy metadata, audit events, timestamps and redacted operational logs.

Polygon balances are public blockchain information retrieved through third-party RPC infrastructure. The current hosted deployment does not submit mainnet transactions.

## Data not requested

MCP tools do not request recovery words, private keys, Vault passwords, API keys, payment-card data, government identifiers or authentication codes. Never place such data in a conversation, screenshot, issue or support request.

## Purpose, retention and sharing

Data is processed to provide the requested wallet interface, authorize public addresses, read public balances, enforce reference policies, protect the service and diagnose failures. Disconnecting the app in ChatGPT removes its stored authorization. The free preview deployment uses temporary runtime storage for intents, policies and audits; that state can disappear after inactivity, restart or redeploy.

AiFinPay does not sell personal data. Hosting, ChatGPT and Polygon RPC providers can process limited technical data under their own terms when providing their respective services.

## Requests and questions

For a non-sensitive privacy question, use [support](SUPPORT.md). For a request containing account, security or personal information, first request a private channel and do not publish the data in GitHub Issues.

This repository-level notice is a transparent beta disclosure, not a substitute for jurisdiction-specific production privacy review.
