# Wrapper Liquidity Intelligence v0.2

Status: LIVE-VALIDATED FOUNDATION — response remains additive until broader size/session validation is completed.

## NVDA live validation — 2026-09-17

Standardized benchmark:

```text
1000 USD
```

Both current NVDA wrappers returned entry and full reverse routes through LiquidMesh.

| Provider | Wrapper | State | Recovery USD | Round-trip friction |
| --- | --- | --- | ---: | ---: |
| bstock | NVDAB | AVAILABLE | 999.650727467682521887 | 0.0349272532317478113% |
| ondo | NVDAon | AVAILABLE | 999.558270460007102376 | 0.0441729539992897624% |

This is a dated current-liquidity observation only.

Underly does **not** interpret the lower number as a permanent "better wrapper" ranking. Quote conditions can change by time, requested size, session state and routing.

## Route evidence

Both wrappers reported:

```text
vendor = LiquidMesh
```

Entry and reverse-route evidence remained independent per wrapper.

## Important observation

The bStocks entry quote showed a negative `priceImpactPercent` in this snapshot.

Underly preserves the upstream value rather than coercing it to zero. Favorable quote deltas and friction are kept as separate concepts.

## Endpoint

```text
GET /api/liquidity?ticker=NVDA&notionalUsd=1000
```

Methodology:

```text
same USDT benchmark
 -> current entry quote
 -> exact synthetic entry output
 -> full reverse quote
```

This is read-only and does not sign or broadcast transactions.

## Still to validate

- multiple benchmark sizes
- non-trading-session behavior
- an explicit insufficient-liquidity case
- cross-provider meaning of reported 24h volume
