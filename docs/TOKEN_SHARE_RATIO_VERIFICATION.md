# Token / Share Ratio Verification

Status: CURRENT SEMANTICS LIVE-VERIFIED FOR NVDA ON 2026-09-17.

## Observed relation

Live NVDA inspection showed:

```text
Ondo
token price / reference price == tokenShareRatio
token price / tokenShareRatio == reference price

bStocks
token price / reference price ~= tokenShareRatio
token price / tokenShareRatio ~= reference price
```

The bStocks difference was at sub-micro price precision and consistent with decimal/quote precision rather than a reversed ratio.

This matches Binance's documented tokenized-security relation:

```text
reference price = token price / shares multiplier
```

For current-price normalization, Underly can therefore interpret the current `tokenShareRatio` as the multiplier in:

```text
shareEquivalentPrice = tokenPrice / tokenShareRatio
```

## Historical caveat

Current ratio semantics are verified.

**Historical ratio continuity is not yet verified.**

Applying today's ratio to every historical candle could be incorrect if the ratio changed after:

- a stock split
- dividend-related token mechanics
- reorganization
- other corporate action

Therefore Underly does not yet apply the current ratio across arbitrary historical windows.

Safe chart modes remain:

- raw token price
- indexed 100 from a common timestamp

A future share-adjusted historical mode must either:

1. establish that the ratio is constant across the requested period; or
2. obtain timestamped ratio/corporate-action history and apply the ratio valid at each candle.
