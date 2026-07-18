## Summary

Describe the user-visible or developer-visible change.

## Why

Explain the problem and why this is the smallest safe solution.

## Verification

- [ ] `npm run check`
- [ ] `npm audit --audit-level=high --omit=dev`
- [ ] Mobile/desktop manual test if UI changed
- [ ] MCP metadata review if tools changed

## Security and privacy

- [ ] No credentials, recovery phrases, private keys, production URLs or customer data
- [ ] Public/private repository boundary preserved
- [ ] Threat model and documentation updated where needed
- [ ] CSP and tool annotations remain accurate

## Screenshots

Add redacted screenshots for UI changes. Never include recovery words, pairing URLs or real financial data.
