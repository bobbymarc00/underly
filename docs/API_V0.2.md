# Underly API v0.2 — Additive Endpoints

Underly v0.1 `/api/firewall/check` remains frozen.

## `GET /api/universe`

Provider-agnostic RWA wrapper universe.

## `GET /api/market-history`

Historical independent wrapper series.

Chart modes:

- `raw`
- `indexed100`

## `GET /api/company`

Company/profile and underlying-fundamental evidence with:

- `CONSENSUS`
- `SINGLE_SOURCE`
- `CONFLICT`
- `UNKNOWN`

## `GET /api/liquidity`

Current standardized wrapper-liquidity observation using the same USD benchmark for every wrapper.

## `GET /api/corporate-actions`

Current ActionGuard + dividend snapshot evidence.

Raw dividend yield remains preserved.

Verified Ondo/bStocks provider conventions are additionally exposed as normalized percentage points.

Unknown providers are not normalized until verified.

Historical event timeline remains explicitly not implemented.

## `GET /api/news`

Current related company/stock news from a configured provider.

Example:

```text
/api/news?ticker=NVDA&limit=10
```

States:

- `AVAILABLE`
- `NOT_CONFIGURED`
- `UNAVAILABLE`

Normalized article fields:

- headline
- source
- published timestamp
- outbound URL
- topics

The first adapter is Alpha Vantage `NEWS_SENTIMENT`.

Underly does not generate fake news or article content.

## Candidate/freeze status

v0.2 endpoints remain additive candidates until their live behavior and regression coverage are accepted and documented.
