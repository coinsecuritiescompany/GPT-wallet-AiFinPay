# OpenAI Build Week compliance checklist

Checked against the official OpenAI Build Week rules and FAQ on July 18, 2026.

## Required project and repository items

- [x] Working project built with Codex and designed for GPT-5.6 orchestration.
- [x] Selected track: **Apps for Your Life** (personal finance).
- [x] English project description and testing instructions.
- [x] Public repository with an MIT License.
- [x] Setup instructions, supported platforms and runnable commands.
- [x] Free hosted demo and public MCP endpoint.
- [x] README explains Codex collaboration, key human decisions and GPT-5.6's role.
- [x] Existing-vs-new work boundary and dated build history.
- [x] Third-party license and trademark notes.
- [ ] Public YouTube demo, three minutes or less, with voiceover.
- [ ] Demo explains the product, Codex workflow and GPT-5.6 usage.
- [ ] Add the primary `/feedback` Codex Session ID to the Devpost submission.
- [ ] Add final screenshots and public YouTube URL to Devpost.
- [ ] Final owner review of eligibility, IP ownership and English materials.

## Judge test path

1. Open the live product page.
2. Add the public `/mcp` endpoint in ChatGPT Developer Mode.
3. Ask ChatGPT to open AiFinPay Wallet.
4. Create a disposable Vault and pair public addresses.
5. Reopen the wallet and inspect live Polygon balances.
6. Open Receive and verify public addresses.
7. Open Send and verify that mainnet signing is safely blocked.

## Evidence

- Source and dated commits: GitHub history.
- Automated verification: GitHub Actions and `npm run check`.
- Codex work narrative: README and `docs/HACKATHON_BUILD_LOG.md`.
- Submission copy: `docs/DEVPOST_SUBMISSION.md`.
- Demo narration: `docs/DEMO_SCRIPT.md`.

## Official sources

- [Official rules](https://openai.devpost.com/rules)
- [Build Week FAQ](https://openai.devpost.com/details/faqs)
- [Judging criteria](https://openai.devpost.com/)

The official rules and Hackathon Website remain the source of truth.
