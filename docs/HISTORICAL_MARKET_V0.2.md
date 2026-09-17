# Historical Market Data v0.2

Status: LIVE-VALIDATED FOUNDATION — chart normalization is still additive and not yet declared frozen.

## Live validation — 2026-09-17

NVDA was tested against Binance Web3 with:

```text
bar=1h
limit=24
```

Both currently available NVDA wrappers returned candle data:

| Provider | Wrapper | Status | Candles | First UTC | Last UTC |
| --- | --- | --- | ---: | --- | --- |
| bstock | NVDAB | AVAILABLE | 24 | 2026-09-16 10:00 | 2026-09-17 09:00 |
| ondo | NVDAon | AVAILABLE | 24 | 2026-09-16 09:00 | 2026-09-17 09:00 |

This confirms that the generic Binance Web3 candle path currently returns usable history for both bStocks and Ondo for this live NVDA sample.

It does **not** prove that every wrapper/provider has the same history depth or interval coverage.

## Important observations

### Do not align arrays by index

The first bStocks sample in the live 24-candle window started one hour later than the first Ondo sample.

Therefore a final chart must align by **timestamp**, never by array position.

Underly uses a union timeline and represents a missing wrapper observation as `null`, not `0`.

### Volume and trade-count comparability is not yet assumed

The live samples showed materially different activity patterns between providers.

That can reflect real liquidity differences, provider-specific routing/market structure, or differences in how Binance aggregates the data.

Until the units and semantics are validated, Underly must not rank wrappers by raw candle `volume` or `tradeCount`.

## Upstream source

```text
GET /api/v1/dex/market/candles
```

Inputs:

- `binanceChainId`
- `tokenContractAddress`
- `bar`
- `before` — start/lower bound
- `after` — end/upper bound
- `limit`

Normalized row:

```text
open, high, low, close, volume, timestamp(ms), tradeCount
```

## Underly endpoint

Raw close-price chart data:

```text
GET /api/market-history?ticker=NVDA&bar=1h&limit=24&mode=raw
```

Indexed comparison:

```text
GET /api/market-history?ticker=NVDA&bar=1h&limit=24&mode=indexed100
```

### Raw mode

`RAW_TOKEN_PRICE`

- one timeline shared across wrapper series
- each wrapper contributes its close price at each timestamp
- absent observation = `null`
- no interpolation
- no zero-fill

### Indexed-100 mode

`INDEXED_100`

The baseline is the **earliest timestamp shared by every AVAILABLE wrapper** in the requested window.

Each wrapper value is:

```text
close_at_t / close_at_common_baseline * 100
```

Decimal.js is used so this is not calculated using binary floating-point financial arithmetic.

If there is no timestamp shared by every available wrapper, indexed mode reports:

```text
chart.status = UNAVAILABLE
chart.reason = NO_COMMON_BASELINE_TIMESTAMP
```

Underly does not silently pick different baseline times per provider.

## Coverage metadata

Each wrapper series exposes:

- candle count
- first timestamp
- last timestamp

The chart also exposes the number of timestamps shared by every AVAILABLE wrapper.

## Still not implemented

### Share-adjusted mode

`tokenShareRatio` is already carried with each wrapper, but Underly will not apply a conversion formula until ratio direction is verified against live non-1 examples.

### Historical underlying/reference line

Current RWA reference pricing exists elsewhere in Underly, but a trustworthy historical underlying/reference series has not yet been added.

### Volume ranking

No wrapper liquidity ranking is derived from historical candle volume yet.
