# Security policy

AiFinPay treats wallet security reports as sensitive. Do not disclose a vulnerability, recovery phrase, private key, Vault password, access token, transaction authorization or personal data in a public issue.

## Supported version

Security fixes are applied to the latest commit on `main`. The public deployment is a beta reference implementation; older commits and forks are not supported.

## Report a vulnerability privately

Use **GitHub → Security → Report a vulnerability** for this repository. Include only the minimum information needed to reproduce the issue:

- affected route, tool or component;
- security impact and prerequisites;
- redacted reproduction steps;
- suggested remediation, if known.

Never include active credentials or real recovery material. If a proof requires a secret, use a disposable test value and label it clearly.

If private vulnerability reporting is unavailable, open a public issue containing no exploit details or sensitive data and request a private follow-up channel.

## Response process

Maintainers will acknowledge reports on a best-effort basis, reproduce them in an isolated environment, assess impact, prepare a fix and coordinate disclosure. No response-time SLA or bug bounty is offered by this public beta.

## Security boundaries

- Mainnet balances are read-only.
- Mainnet signing and broadcasting are disabled.
- Recovery phrases and passwords are processed only by the browser Vault.
- Pairing sends validated public addresses only.
- The public deployment uses temporary session and pairing storage.
- The project has not completed an independent production security audit.

See [Security model](docs/SECURITY_MODEL.md), [Threat model](docs/THREAT_MODEL.md) and [Public/private boundary](docs/PUBLIC_PRIVATE_BOUNDARY.md).
