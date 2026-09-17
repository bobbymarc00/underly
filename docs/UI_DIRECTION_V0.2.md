# Underly UI Direction v0.2

Status: DESIGN DIRECTION — implementation intentionally deferred until the v0.2 data contracts are stable.

## Visual direction

The final interface should feel like a modern stock exchange / market terminal:

- dense enough for serious inspection
- clean and readable
- not a generic crypto dashboard
- no black-box "safety score"
- no UI-owned risk thresholds
- evidence and provenance remain inspectable

The current GG UI prototype is disposable. It must not constrain the final information architecture.

## Primary asset page

A target asset page should eventually contain:

```text
Ticker + company name + current reference context

Multi-wrapper line chart
  wrapper A
  wrapper B
  wrapper C
  underlying/reference baseline when available

Time ranges
  1H / 1D / 1W / 1M / 1Y / MAX where supported

Tabs / sections
  Overview
  Wrappers
  Liquidity
  Fundamentals
  Dividends & corporate actions
  Evidence
  News
```

## Multi-wrapper line chart

All wrappers for the same underlying should appear in **one chart field**.

Requirements:

- one series per wrapper
- provider-agnostic: render `result.wrappers` / universe results dynamically
- no assumption that there are exactly two providers
- stable presentation colors may be assigned per provider
- current preferred presentation:
  - bStocks: yellow
  - Ondo: orange
- a future provider receives another distinct color
- color is presentation only and must never imply risk/severity
- optional underlying/reference series should use a neutral visual treatment
- legend identifies provider + wrapper symbol
- missing history must appear as missing data, not zero

Potential comparison modes:

1. **Raw token price**
2. **Share-adjusted**
3. **Indexed 100**

Share-adjusted mode must not be implemented until the token/share-ratio direction and formula are explicitly verified against live examples.

## Wrapper detail

Each wrapper should expose, where evidence exists:

- provider
- symbol
- contract
- chain
- decimals
- token/share ratio
- attestation status and links
- token price
- reference price
- reference divergence
- market/session state
- volume / liquidity metadata
- execution availability
- execution friction
- executable value
- ActionGuard
- deterministic findings
- source timestamps and proof references

## Company profile

The stock-style page should include a company profile independent of wrapper metadata:

- company name
- ticker
- description
- industry / sector
- website
- market cap
- 52-week range
- volume / average volume
- P/E
- P/B
- dividend yield
- latest dividend information

## Liquidity

Liquidity must be more than a single "volume" number.

Keep these concepts separate:

- market/on-chain volume
- quote route availability
- execution vendor
- entry liquidity
- exit liquidity
- execution friction
- current executable / liquidation value

Do not create frontend risk thresholds. Backend findings remain authoritative.

## Dividends and corporate actions

The final experience should have a dedicated timeline or table for explicit events.

Do not conflate:

- ordinary market session status
- ActionGuard current restriction state
- historical/announced corporate actions

## News

Show current related company/stock news near the lower part of the asset page.

Requirements:

- latest first
- source visible
- publish time visible
- headline
- outbound source URL
- no invented article summaries
- source provider abstracted from the core Underly inspection engine

## Responsive behavior

Desktop should feel like a market terminal.

Mobile should preserve inspection capability rather than merely shrinking desktop:

- horizontally scrollable chart when necessary
- wrapper comparison can stack
- long contract/hash values must not break layout
- provider legend remains usable with 3+ wrappers
- evidence/proof remains accessible

## Architecture rule

Final UI consumes normalized backend contracts.

It must not:

- recompute risk findings
- infer PASS from missing data
- invent provider metadata
- invent news
- silently normalize wrapper prices without an explicit chart mode
