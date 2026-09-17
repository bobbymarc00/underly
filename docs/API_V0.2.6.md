# Underly API v0.2.6 — Historical Corporate Actions

This milestone is additive. `/api/firewall/check` remains frozen.

## `GET /api/corporate-actions/history`

Required query:

- `ticker`

Optional query:

- `limit` — integer `1..500`, default `100`

Example:

```text
/api/corporate-actions/history?ticker=NVDA&limit=100
```

Top-level states:

- `AVAILABLE` — both historical datasets available
- `PARTIAL` — one historical dataset unavailable
- `NOT_CONFIGURED` — Alpha Vantage key absent
- `UNAVAILABLE` — both historical datasets failed; HTTP 502

Historical events are newest-first and use a provider-neutral schema. Raw source rows are retained at `events[].source.raw`. Rows that cannot safely become a historical event remain inspectable at `sources[].rejectedRecords[].raw`.

The route is intentionally separate from `/api/corporate-actions`; historical evidence cannot activate or mutate Binance ActionGuard.
