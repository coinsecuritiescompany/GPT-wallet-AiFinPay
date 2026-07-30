# OpenAI Build Week compliance checklist

Checked against the official OpenAI Build Week rules and FAQ on July 30, 2026.

## Submission freeze and evidence

Submissions closed on July 21, 2026 at 5:00 PM PT. Devpost's post-deadline update says submitted descriptions, video links and repositories must not be changed during judging. This repository already received post-deadline product fixes. To keep the evidence auditable:

- `build-week-submission-2026-07-21` points to commit `f965e7c280172057b9a40d25a1ed5dd968c4a54d`, the last repository commit before the deadline;
- `main` contains later, clearly dated product/reliability work;
- judges can compare the preserved branch with `main` rather than treating post-deadline fixes as part of the original submission.

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
5. Reopen the wallet and scroll the complete 13-mainnet selector.
6. Inspect live Polygon balances and verify public addresses in Receive.
7. Open Send and verify that it is available only on a signing-enabled EVM network and requires separate local review/signing.

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
- [Submissions closed / no post-deadline edits](https://openai.devpost.com/updates/45418-submissions-are-closed)

The official rules and Hackathon Website remain the source of truth.
