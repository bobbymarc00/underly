# Underly Market Terminal

Status: **FROZEN FOR FINAL DOCS / RELEASE PREP**

This document describes the market-terminal behavior validated on 2026-09-19.

## Landing page

The landing page is an asymmetric terminal-style market mosaic with three views:

```text
Hot
Gainers
Losers
```

### Hot

Hot uses Binance RWA token-list `volume24H` evidence.

It intentionally does **not** require per-wrapper liquidity calls, keeping the first landing render bounded and fast.

### Gainers / Losers

Mover views are lazy-loaded only after the user selects them.

The route uses:

1. bounded primary-wrapper discovery
2. second-wrapper verification only for the strongest candidates
3. direction consistency checks
4. a bounded cross-wrapper spread requirement
5. a reference-price guard for single-source candidates

The implementation uses an adaptive candidate budget and bounded output rather than exhaustively probing the full universe.

The ranking is a current market-display selection, **not a wrapper-quality ranking** and not an execution recommendation.

## Stock detail

The stock detail presents:

- headline reference
- per-wrapper reference + provenance
- token/share ratio
- P/E
- normalized dividend-yield display
- trading-access/session evidence
- resolved fundamentals
- standardized liquidity
- ActionGuard
- historical corporate actions
- contextual news
- on-demand HOLD proof

## Headline reference

The stock hero does not display cross-provider `CONFLICT`.

Instead it chooses one deterministic display anchor:

```text
1. valid UNDERLYING_MARKET reference
2. otherwise valid RWA_PRICE reference
3. deterministic provider tie-break
4. badge = SINGLE SOURCE
```

This is only a headline selection rule.

Wrapper rows still show provider-specific values and provenance. The API's resolved evidence can still retain `CONFLICT` for genuinely different cross-provider values.

## Resolved fundamentals

Ordinary fundamental evidence remains evidence-preserving:

```text
CONSENSUS
SINGLE_SOURCE
CONFLICT
UNKNOWN
```

Numeric canonicalization eliminates formatting-only conflicts.

Examples:

```text
779.3700 == 779.37    -> equivalent evidence
27.4600 != 26.78      -> genuine conflict
```

No arbitrary tolerance is applied to silently merge genuinely different market cap, P/E, or P/B values.

## Dividend yield

The UI shows:

```text
DIVIDEND YIELD · NORMALIZED
```

where supported provider conventions are normalized to percentage points.

Raw provider values remain available so the normalized display is auditable.

Underly does not silently recompute or annualize provider-reported dividend yield.

## Liquidity

Each wrapper may receive a standardized benchmark probe, currently displayed around a `$1,000` benchmark.

The primary round-trip metric is based on actual quote recovery:

```text
benchmark -> buy quote -> exact token output -> immediate reverse quote
```

Round-trip friction is a **current quote snapshot**. It is not:

- realized wallet P&L
- a forecast
- a permanent wrapper characteristic
- a recommendation to prefer one wrapper

## ActionGuard and history

Current ActionGuard/session evidence and historical corporate-action evidence remain separate.

Historical evidence currently supports sourced:

- dividends
- stock splits

Missing history does not imply "no corporate action ever"; it means no supported historical event was returned by the configured source for that request.

## HOLD proof

HOLD proof makes wrapper-integrity evidence explicit.

A wrapper can have:

```text
Reference: AVAILABLE
Integrity: UNKNOWN
```

when reference evidence is present but attestation metadata is not.

Missing daily/monthly attestation metadata is now named directly in the finding and remains fail-closed `UNKNOWN`.

## News

Market and exact-ticker news use a shared provider/cache abstraction.

Public errors are sanitized:

- no raw provider API-key/configuration messages
- no secret-bearing upstream detail
- generic unavailable/not-configured UI state when appropriate

## Read-only rule

Nothing on the market terminal creates an execution path.

The product remains:

```text
inspect
compare evidence
observe quotes
read public state
```

not:

```text
approve
sign
broadcast
trade
```
