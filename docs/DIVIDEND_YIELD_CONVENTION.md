# Dividend Yield Provider Convention

Status: VERIFIED FOR CURRENT ONDO + BSTOCK LIVE FEEDS ON 2026-09-17.

## Diagnostic sample

Overlap tickers were queried from the live Binance Web3 RWA underlying-market surface.

Observed nonzero pairs:

| Ticker | Ondo raw | bStocks raw | Ondo / bStocks |
| --- | ---: | ---: | ---: |
| NVDA | 0.13 | 0.00130000 | 100 |
| IBM | 2.7 | 0.02820000 | 95.7447 |
| MSFT | 0.72 | 0.00730000 | 98.6301 |
| QCOM | 1.91 | 0.01940000 | 98.4536 |
| AVGO | 0.75 | 0.00750000 | 100 |
| MU | 0.05 | 0.00050000 | 100 |

TSM had no yield value in this snapshot. INTC returned zero from both providers.

The same diagnostic showed matching `latestDividend` values across the compared wrappers.

## Interpretation

The data strongly supports a provider unit-convention difference:

```text
Ondo    -> percentage points
bStocks -> unit fraction
```

Example:

```text
Ondo    0.13        -> 0.13%
bStocks 0.00130000  -> 0.13%
```

Small post-normalization differences on IBM/MSFT/QCOM remain real source differences and are not erased.

## Underly normalization

Raw values are always preserved.

Additional normalized field:

```text
normalizedPercent
```

Rules currently verified:

```text
ondo    normalizedPercent = raw
bstock  normalizedPercent = raw * 100
```

Unknown future providers:

```text
normalizationStatus = UNKNOWN_PROVIDER_CONVENTION
normalizedPercent = null
```

Underly does not guess.

## Reconciliation

The raw dividend-yield field can remain `CONFLICT`.

A separate normalized percentage-point reconciliation is exposed.

This allows the final UI to show a common display unit while still preserving source differences and raw evidence.
