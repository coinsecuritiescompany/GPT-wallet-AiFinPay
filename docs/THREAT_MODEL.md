# Threat model

| Threat | Impact | Current mitigation | Remaining risk / next control |
|---|---:|---|---|
| User exposes recovery words in chat or screenshot | Critical | Repeated warnings; tools never request words | User education cannot prevent voluntary disclosure; rotate wallet immediately |
| Malicious page reads the local Vault | Critical | Same-origin browser storage and CSP | Add dedicated origin, hardware-backed options and security audit |
| Weak Vault password / offline guessing | Critical | PBKDF2-SHA256 and minimum length | Review KDF parameters; consider memory-hard KDF and platform key store |
| OAuth code/token theft | High | PKCE S256, exact redirect/resource binding, two-minute one-use codes, scoped one-hour access tokens | Add durable refresh-token revocation and device/session management |
| Cross-user wallet confusion | Critical | OAuth identity plus server-side user resolution | Add formal authorization testing and account recovery procedures |
| Prompt injection requests secrets or payment | Critical | No secret inputs; deterministic policy; explicit review and local user-presence signing | Add adversarial model/tool abuse testing |
| RPC returns false balance data | High | Two-provider fallback and cache | Add multi-provider comparison and explorer verification |
| Supply-chain compromise | Critical | Lockfile, CI, dependency audit, limited CSP | Add CodeQL, SBOM, provenance and signed releases |
| Replay or duplicate intent | High | Idempotency, expiring intents, state machine and single-use intent state | Use transactional distributed idempotency for multi-instance deployment |
| Recipient/amount/fee substitution | Critical | Canonical preview, HMAC submission binding, signed-byte decoding, signer and field comparison | Add independent transaction simulation and fuzzing |
| Browser/XSS compromise | Critical | No dynamic third-party widget assets; restrictive headers | External assessment, Trusted Types and isolated Vault origin |
| Logging or support leakage | High | Minimal structured logs and public warnings | Central redaction rules and private support channel |
| Runtime storage loss | High | Persistent disk declared in the production Blueprint | Add encrypted external backups, restore tests and managed database migration |
| Unauthorized repository disclosure | Critical | Public/private boundary and CI scan | Manual review, branch protection and private repo access controls |

## Out of scope for the current mainnet beta

Non-EVM signing, custodial recovery, fiat/payment-card processing, exchange/brokerage services, regulated custody and claims of regulatory authorization. Enabling any of these changes the threat model and requires a new review.
