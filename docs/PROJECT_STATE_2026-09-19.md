# Underly Project State — 2026-09-19

> **Read this first in a new development / ChatGPT session.**

This file records the validated local state immediately before final README/docs cleanup and Git push.

## Repository

```text
Repository: https://github.com/bobbymarc00/underly
Branch:     main
Base HEAD:  a487ae1
Commit:     feat: complete Underly market terminal UI
```

The feature/evidence work described below exists in the local working tree on top of that base until it is committed/pushed.

The pre-docs freeze manifest is:

```text
docs/freeze/LOCAL_FREEZE_2026-09-19.txt
```

## Product boundary

Underly is a **read-only tokenized-equity intelligence layer on BNB Smart Chain**.

Hard boundary:

- no trade execution
- no swap execution
- no ERC-20 approval
- no private key / seed phrase
- no transaction signing
- no transaction broadcast

Real/write transaction functionality is out of scope.

## Frozen backend history

The v0.1 firewall remains frozen:

```text
POST /api/firewall/check
GET  /api/search
```

The v0.2 additive backend foundation remains documented in:

```text
docs/API_V0.2.md
docs/SCHEMA_FREEZE_V0.2.md
```

Do not casually rewrite the frozen firewall schema or safety boundary while working on UI/docs.

## Current routes

Pages:

```text
/
/stock/[ticker]
/wallet
/inspect
```

APIs:

```text
/api/search
/api/firewall/check
/api/universe
/api/company
/api/liquidity
/api/corporate-actions
/api/corporate-actions/history
/api/news
/api/market-history
/api/wallet-inspector
/api/landing-rankings
```

## Current market-terminal behavior

### Landing

Three views:

```text
Hot
Gainers
Losers
```

Hot:

- derived from Binance token-list `volume24H`
- no liquidity calls required

Gainers / Losers:

- lazy-loaded
- adaptive bounded candidate budget
- two-stage discovery
- primary wrapper candidate first
- second-wrapper verification for strongest candidates
- multi-wrapper candidate requires same direction and bounded spread
- single-source candidate requires reference-price guard
- bounded display output

This is not a permanent wrapper ranking.

### Stock headline reference

Important final policy:

**Do not show cross-provider `CONFLICT` in the hero reference.**

Select one headline source:

```text
1. UNDERLYING_MARKET reference
2. fallback RWA_PRICE reference
3. deterministic provider tie-break
4. hero badge SINGLE SOURCE
```

Provider-specific references remain visible in wrapper rows.

Example live behavior observed during validation:

```text
GOOGLB  reference 355.300146  source RWA_PRICE
GOOGLon reference 354.076     source UNDERLYING_MARKET

hero chooses the Underlying Market source as SINGLE SOURCE
```

### Ordinary resolved fundamentals

Keep:

```text
CONSENSUS
SINGLE_SOURCE
CONFLICT
UNKNOWN
```

Numeric canonicalization is enabled.

Formatting-only differences such as:

```text
779.3700
779.37
```

must not create a false conflict.

Genuine differences remain conflict. Do not add arbitrary tolerance simply to hide them.

### Dividend yield

Known provider conventions are normalized to percentage points for display while raw values remain preserved.

Previously validated NVDA example:

```text
bStocks raw 0.00130000 -> normalized 0.13%
Ondo    raw 0.13       -> normalized 0.13%
```

### Liquidity

Current standardized probe:

```text
USDT benchmark -> wrapper -> immediate reverse quote -> USDT
```

Round-trip friction is derived from benchmark vs recovered quote value.

Do not sum route metadata fields such as reported price impact + fee + raw gas estimate and call that round-trip friction.

A previously observed 2%+ Ondo NVDA quote was later disproven as a stable characteristic by repeated samples around ~0.044%; core liquidity math was left unchanged.

### HOLD proof

A bStocks wrapper may show:

```text
Reference: AVAILABLE
Integrity: UNKNOWN
```

when daily/monthly attestation metadata is unknown.

Final behavior:

```text
Missing: daily attestation, monthly attestation.
Underly will not treat missing data as a pass.
```

Do not convert unknown attestations to PASS.

### News

News/public provider errors are sanitized. Do not leak raw provider/API-key/configuration error text to the UI.

### Historical evidence

Historical corporate-action evidence is separate from current ActionGuard.

Supported sourced event types remain:

```text
DIVIDEND
STOCK_SPLIT
```

Do not fabricate events.

## Important current modules added during this phase

```text
src/app/api/landing-rankings/route.ts
src/lib/news/public-error.ts
src/lib/ui/reference-selection.ts
src/lib/underly/evidence.ts
src/lib/underly/landing-ranking.ts
```

Important regression tests added include:

```text
tests/dividend-display-regression.test.ts
tests/evidence-numeric-equivalence.test.ts
tests/headline-reference-selection.test.ts
tests/landing-ranking-consensus.test.ts
tests/landing-ranking-reference-guard.test.ts
tests/landing-ranking-reference-route.test.ts
tests/landing-rankings-adaptive-budget.test.ts
tests/landing-rankings-performance.test.ts
tests/landing-rankings-two-stage.test.ts
tests/news-public-error.test.ts
tests/ui-evidence-semantics-followup.test.ts
tests/ui-headline-reference-single-source.test.ts
tests/ui-terminal-landing-rankings.test.ts
tests/ui-terminal-market-tabs.test.ts
tests/ui-terminal-semantic-cleanup.test.ts
tests/ui-terminal-surface-colors.test.ts
```

## Final validation snapshot

Latest completed audit before docs:

```text
Targeted tests:   18/18 PASS
Full test suite:  214/214 PASS
Production build: PASS
TypeScript:       PASS
git diff --check: PASS
```

Runtime smoke also returned HTTP 200 for:

```text
/api/universe
/api/landing-rankings
/api/news
/api/search
/api/company
/api/liquidity
/api/corporate-actions
/api/corporate-actions/history
/api/firewall/check
```

Stock-detail UI was visually checked after the final reference-selection changes.

## Git state before final docs patch

The recorded pre-docs freeze state was:

```text
19 tracked modified files
22 untracked/new files
Base HEAD a487ae1
```

After applying final docs, counts will change because README/docs themselves are additional changes. Use `git status --short` as the authority.

`next-env.d.ts` was intentionally restored and was clean at freeze.

LF -> CRLF warnings on Windows were observed and are not failures; `git diff --check` passed.

## Deferred / do not "fix" without new evidence

- historical share-adjusted chart
- historical token/share-ratio continuity assumption
- unsupported corporate-action categories
- write/trade execution
- private-key or signing flows
- permanent "best wrapper" ranking from transient quote snapshots
- arbitrary numeric tolerances that hide genuine provider disagreement

## Recommended continuation order

If continuing after the final push:

1. fetch/pull the pushed `main`
2. read this document
3. read `README.md`
4. read `docs/SCHEMA_FREEZE_V0.2.md`
5. read `docs/API_V0.2.md`
6. run `npm test`
7. run `npm run build`
8. only then make additional changes

For a new ChatGPT session, provide the repository URL and say:

> Read `docs/PROJECT_STATE_2026-09-19.md` first and use it as the project handoff. Do not change the frozen read-only boundary or previously validated evidence semantics without a reproduced bug or new source evidence.
