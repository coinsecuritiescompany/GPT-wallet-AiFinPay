# Swap: verified pair registry

## The problem

ChangeNOW's `/exchange/currencies?active=true` returns **575 assets** on the
networks the Vault controls. The swap UI turned that into two free dropdowns —
**330,050 selectable pairs**.

An active asset list is not a pair-availability list. A random sample of 25
pairs drawn from that list, quoted live on 8 August 2026, returned a usable
price **44%** of the time. Roughly **40%** answered `pair_is_inactive`. Some
assets are not quotable in any direction at all:

- **POL** — the provider answers "Currency pol is not supported" on every route,
  both directions. Polygon's own native token cannot be swapped.
- **AVAX (avaxc)** — `not_valid_params` against USDT.

So the majority of what a user could select could not be paid, and the interface
gave no signal about which was which until after they committed to a quote.

## The contract now

`apps/mcp-server/src/services/verified-pairs.ts` holds a versioned, server-side
registry. Each entry records the from/to ticker and network, a minimum amount
known to clear the provider's floor, the status, and the timestamp of the last
live quote.

**An entry in that file is a claim that the pair was quoted successfully.** Do
not add a pair because the provider lists both assets — verify it first.

| Behaviour | Default (curated) | Advanced (`show_all: true`) |
|---|---|---|
| Assets offered | Only those a verified route needs | Every provider asset |
| Destination list | Only verified routes from the chosen source | Any other asset |
| Presented as supported | Yes | **No** — explicit unverified warning |

The widget builds the "You receive" list from the verified routes for the
selected source, so an unverified combination is not selectable in the default
mode at all. Changing the source clears the destination, so a route left over
from a previous selection cannot be quoted.

Advanced mode is opt-in per session, replaces the opt-in control with a warning
that the pairs are untested, and sends no `verifiedPairs` — nothing in that mode
can claim a pair is supported. Inactive-pair and below-minimum errors still
surface verbatim from the provider (see `providerFailureMessage`).

## Availability cache

`PairAvailabilityCache` remembers for five minutes that the provider refused a
pair, so a refusal is not rediscovered on every keystroke. It records provider
availability only. It **cannot** promote a pair into the verified set:
`isVerifiedPair` reads the static registry and never consults the cache. A
cached *success* is deliberately inert — the only way a pair becomes verified is
a human adding it to the registry after a live check.

## Verified pairs (live-checked 2026-08-08T19:52:51Z)

| From | To | Min test amount |
|---|---|---|
| CSPR (cspr) | USDT (matic) | 150 |
| USDT (matic) | CSPR (cspr) | 20 |
| CSPR (cspr) | SOL (sol) | 150 |
| SOL (sol) | CSPR (cspr) | 0.1 |
| CSPR (cspr) | USDC (base) | 150 |
| CSPR (cspr) | ETH (base) | 150 |
| SOL (sol) | USDT (matic) | 0.1 |
| USDT (matic) | SOL (sol) | 20 |
| ETH (base) | USDT (matic) | 0.01 |
| BNB (bsc) | USDT (matic) | 0.05 |
| NEAR (near) | USDT (matic) | 5 |
| APT (apt) | USDT (matic) | 2 |

Checked and **excluded**: `AVAX (avaxc) → USDT (matic)` (`not_valid_params`),
anything involving `POL`, and `SAND (matic) → USDT (matic)`
(`pair_is_inactive`).

## Re-verifying

Quote each candidate pair against `/exchange/estimated-amount` with
`flow=standard&type=direct` and no `useRateId` — sending `useRateId` alongside
the standard flow makes the provider reject the request outright. A pair that
returns a numeric `estimatedAmount` may be added with today's date; a pair that
returns an error must be removed or left out. Update `lastVerified` when you
re-check, and do not extend the list without a live check.

## Tests

`apps/mcp-server/tests/verified-pairs.test.ts` — registry contents and evidence
fields, case-insensitive matching, unverified route between two verified assets,
POL exclusion, AVAX/SAND exclusion, assets delisted by the provider, cache
expiry, and the cache's inability to promote a pair.

`apps/wallet-widget/src/App.test.tsx` — verified default route, destination
list restricted to verified routes, destination reset on source change, opt-in
required for the full list, advanced-mode warning.
