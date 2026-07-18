# Contributing

Thank you for helping improve AiFinPay Wallet for ChatGPT. This repository accepts focused changes to the public reference implementation, documentation, tests and interoperability surfaces.

## Before opening a change

1. Check existing issues and pull requests.
2. For a large architectural change, open a proposal issue first.
3. Keep production credentials, customer data and proprietary backend code outside this repository.
4. Confirm that your contribution is yours to license under MIT and complies with third-party licenses.

## Development

```bash
npm ci
cp .env.example .env
npm run check
npm audit --audit-level=high --omit=dev
```

Use disposable test wallets only. Never use a real recovery phrase in tests, fixtures, screenshots or issues.

## Pull requests

- Explain the problem and the smallest solution.
- Add or update tests for behavior changes.
- Update README, security, privacy and tool documentation when behavior changes.
- Preserve one-job-per-tool MCP design and accurate read/write/destructive annotations.
- Keep CSP allowlists exact.
- Include a security impact statement for wallet, auth, storage or network changes.
- Make sure `npm run check` passes.

Maintainers may request changes, close out-of-scope proposals or defer production-only work to the private implementation.
