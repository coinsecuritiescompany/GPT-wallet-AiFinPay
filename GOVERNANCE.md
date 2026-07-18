# Governance

AiFinPay Wallet for ChatGPT is currently maintainer-led.

## Decision model

- Maintainers define product scope, security boundaries and releases.
- Small fixes can be accepted through normal pull-request review.
- Changes affecting custody, authentication, signing, compliance, public APIs or data handling require explicit maintainer approval and updated security documentation.
- Production-only or confidential work belongs in the private implementation and is not reviewed in public issues.

## Releases

Releases use semantic versioning where practical. Security fixes can be released without a normal deprecation period. Public behavior, MCP contracts and legal/privacy changes must be recorded in [CHANGELOG.md](CHANGELOG.md).

## Independence

Project governance is independent of OpenAI, Polygon Labs, Circle and other integration providers. Their trademarks, services and specifications remain governed by their respective owners.
