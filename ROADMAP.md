# Roadmap

Roadmap items describe direction, not delivery commitments.

## Public reference app

- Move OAuth refresh-token revocation and account metadata to a durable production identity provider.
- Add output schemas for every MCP tool and submission regression tests.
- Move the persistent single-instance SQLite state to managed multi-instance storage with tested encrypted backups.
- Expand indexed history beyond the current best-effort Polygon integration without leaking private metadata.
- Improve mobile cold-start behavior and accessibility QA.
- Publish signed releases, SBOMs and dependency provenance.

## Security-gated production work

- Full transaction simulation, multi-RPC verification and adversarial signed-transaction fuzzing.
- Non-EVM signing plus transaction replacement/cancellation and confirmation monitoring.
- Independent wallet cryptography and application security audits.
- Incident response, key-rotation and disaster-recovery exercises.
- Jurisdiction-specific legal, privacy, AML/sanctions and licensing assessment.

Production work will be implemented privately and exposed publicly only through reviewed contracts, documentation and auditable releases.
