# Underly UI Direction v0.2

Status: **BACKEND FOUNDATION FREEZE CANDIDATE — FINAL UI NEXT**

## Visual direction

The final interface should feel like a modern stock exchange / market terminal:

- dense enough for serious inspection
- clean and readable
- not a generic crypto dashboard
- no black-box safety score
- no UI-owned risk thresholds
- evidence and provenance remain inspectable

The existing prototype is not a constraint on final information architecture.

## Primary asset page

Target structure:

```text
Ticker + company name + current reference context

Multi-wrapper line chart
  wrapper A
  wrapper B
  wrapper C
  optional future authoritative reference baseline

Time range / candle controls

Sections
  Overview
  Wrappers
  Liquidity
  Fundamentals
  Dividends & corporate actions
  ActionGuard / findings
  Evidence
  News
```

## Multi-wrapper chart

Requirements:

- one series per wrapper
- provider-agnostic; never assume exactly two providers
- stable presentation colors may be assigned per provider
- current preferred presentation: bStocks yellow, Ondo orange
- color is presentation only and never severity/risk
- legend identifies provider + wrapper symbol
- missing history remains missing, never zero-filled

Frozen backend modes:

1. **Raw token price**
2. **Indexed 100**

### Share-adjusted historical mode

Current token/share-ratio **direction/formula** is live-verified, but historical ratio **continuity** is not. Today's ratio must not be applied across an arbitrary historical window.

Therefore share-adjusted historical mode remains intentionally disabled/deferred until one of these is evidenced:

1. the ratio is constant throughout the requested period; or
2. timestamped ratio/corporate-action history identifies the valid ratio for each candle.

The UI must not implement a hidden approximation.

## Wrapper detail

Expose where evidence exists:

- provider / symbol / contract / chain / decimals
- token/share ratio
- token and reference price
- reference divergence
- market/session state
- attestation metadata
- volume/liquidity metadata
- entry/exit route availability
- execution friction / current executable value
- ActionGuard / deterministic findings
- source timestamps / proof references

## Company profile

Keep company data independent from wrapper metadata:

- company name / ticker
- description
- industry
- website
- market cap
- 52-week range
- volume / average volume
- P/E / P/B
- dividend yield / latest dividend

Conflicting wrapper evidence remains visible as conflict; the UI must not choose a winner.

## Dividends and corporate actions

Keep separate:

- ordinary session state
- current ActionGuard restriction classification
- historical explicit corporate-action events

v0.2 historical event support is dividends + stock splits. Do not display unsupported event types as if sourced.

## News

Show source, publication time, headline, and outbound URL. Do not generate article summaries unless a future explicitly sourced feature is added.

## Wallet holdings

An optional wallet view may accept a **public EVM address** and render only tokenized-equity wrappers found by `/api/wallet-inspector`.

It must never request:

- seed phrases
- private keys
- signatures
- approvals

Failed contract reads must remain distinguishable from zero balance.

## Responsive behavior

Desktop should feel like a market terminal. Mobile must preserve inspection capability:

- horizontally scrollable chart where necessary
- wrapper comparison may stack
- long contract/hash values must not break layout
- provider legend remains usable with 3+ wrappers
- evidence/proof remains accessible

## Architecture rule

Final UI consumes normalized backend contracts. It must not recompute risk findings, infer PASS from missing data, invent provider metadata, fabricate news/events, or introduce transaction execution.
