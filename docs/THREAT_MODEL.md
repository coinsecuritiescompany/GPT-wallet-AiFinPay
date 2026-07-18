# Threat model

| Threat | Impact | Current mitigation | Remaining risk / next control |
|---|---:|---|---|
| User exposes recovery words in chat or screenshot | Critical | Repeated warnings; tools never request words | User education cannot prevent voluntary disclosure; rotate wallet immediately |
| Malicious page reads the local Vault | Critical | Same-origin browser storage and CSP | Add dedicated origin, hardware-backed options and security audit |
| Weak Vault password / offline guessing | Critical | PBKDF2-SHA256 and minimum length | Review KDF parameters; consider memory-hard KDF and platform key store |
| Pairing-token theft | High | Random token, hash at rest, ten-minute expiry, one-time use | Avoid URL leakage; bind to authenticated user/device in production |
| Cross-user wallet confusion | Critical | Server-side user resolution | Shared beta session is unsuitable for public multi-user production; add OAuth |
| Prompt injection requests secrets or payment | Critical | No secret inputs; deterministic policy; mainnet send disabled | Add model/tool abuse testing and user-presence signing |
| RPC returns false balance data | High | Two-provider fallback and cache | Add multi-provider comparison and explorer verification |
| Supply-chain compromise | Critical | Lockfile, CI, dependency audit, limited CSP | Add CodeQL, SBOM, provenance and signed releases |
| Replay or duplicate intent | High | Idempotency and state machine in demo flow | Use transactional distributed idempotency in production |
| Recipient/amount substitution | Critical | Prepared intent binds validated fields | Local signing preview must bind canonical transaction bytes |
| Browser/XSS compromise | Critical | No dynamic third-party widget assets; restrictive headers | External assessment, Trusted Types and isolated Vault origin |
| Logging or support leakage | High | Minimal structured logs and public warnings | Central redaction rules and private support channel |
| Ephemeral storage loss | Medium | Disclosed preview limitation | Managed database with encrypted backups and retention controls |
| Unauthorized repository disclosure | Critical | Public/private boundary and CI scan | Manual review, branch protection and private repo access controls |

## Out of scope for the current public beta

Real transaction signing, broadcasting, fiat/payment-card processing, regulated custody and production customer data. Enabling any of these changes the threat model and requires a new review.
