# Underly Architecture

## Layers

`src/lib/binance/`
: Transport and Binance Web3 API adapters only. No product-risk decisions.

`src/lib/underly/`
: Underly product logic: passport, integrity, intent-aware execution, valuation, findings and proof.

`src/lib/rules/`
: Explicit product-policy thresholds.

`src/app/api/`
: HTTP validation and status-code mapping.

`src/app/page.tsx`
: Minimal debug UI. It renders API output; it must not contain risk logic.

## Intent-aware execution

```text
BUY
 USDT -> token quote
          |
          v
 token -> USDT full reverse quote
          |
          v
 current entry/exit liquidity probe

HOLD
 no aggregator execution call

SELL
 exact tokenAmount OR USD position notional
       |
 user quantity OR token-price-derived quantity
       |
 token -> USDT direct quote

COLLATERAL
 same direct liquidation path as SELL
       |
 current executable liquidation value
       |
 conservative valuation
```

Direct SELL/COLLATERAL quantity provenance is explicit: `USER_SUPPLIED` for exact `tokenAmount`, or `DERIVED_FROM_TOKEN_PRICE` for the `amountUsd` fallback. Underly never presents a derived quantity as an exact wallet holding.

## Execution breakdown layer
`src/lib/underly/execution.ts` owns execution measurement and emits explicit per-leg benchmark objects. The UI must render these values; it must not recompute friction from raw quote data.
