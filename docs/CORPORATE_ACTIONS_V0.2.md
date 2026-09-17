# Dividends & Corporate Actions v0.2

Status: CURRENT-SNAPSHOT FOUNDATION.

## Current Binance RWA evidence

Underly exposes:

- current ActionGuard
- current market/session reason evidence
- latest dividend
- dividend yield
- provider-normalized dividend yield percentage points

Ordinary session restrictions remain separate from corporate actions.

## Dividend-yield normalization

Live diagnostics on 2026-09-17 verified different current provider conventions:

```text
Ondo    -> percentage points
bStocks -> unit fraction
```

Underly now preserves both:

```text
raw dividendYield
dividendYieldNormalized
```

Top-level reconciliation also exposes:

```text
dividendYieldPercent
```

Unknown future providers are not normalized without verification.

## Historical corporate actions

The current Binance REST RWA surface used by Underly still does not provide the event-list contract Underly needs for a historical timeline.

Therefore:

```text
history.status = NOT_IMPLEMENTED
```

No event date is invented from `latestDividend`.

## Candidate next source

Alpha Vantage's current API documentation provides dedicated historical/future `DIVIDENDS` and historical `SPLITS` endpoints.

Because the new related-news adapter already keeps Alpha Vantage outside the Binance RWA core, those corporate-action endpoints can later be integrated as a separate historical evidence source without changing ActionGuard semantics.
