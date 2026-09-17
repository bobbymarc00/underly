# Underly v0.2 Roadmap — Market Data Foundation

Status: PLANNED / incremental implementation

Underly v0.1 remains frozen and production-stable. v0.2 expands the product beside the existing `/api/firewall/check` contract rather than silently changing it.

## Product direction

Underly is evolving from a single inspection response into a read-only tokenized-equity market and wrapper intelligence product.

The final product should feel closer to a stock-exchange / market terminal than a generic crypto dashboard, while preserving the original principle:

> Know what you really hold.

## Milestone order

### 1. Wrapper Universe

Goal: discover every wrapper/provider Binance Web3 currently exposes for the configured chain without assuming the provider set is permanently limited to Ondo and bStocks.

Planned contract:

- `GET /api/universe`
- provider list derived from live upstream data
- underlying-to-wrapper grouping
- provider/wrapper counts
- contract, symbol, chain, decimals and token/share-ratio metadata
- deterministic ordering
- unknown/future provider IDs are retained, not discarded

The frozen v0.1 `platform` filter remains unchanged for compatibility.

### 2. Historical Market Data

Required before the final chart UI.

Goals:

- historical observations/candles per wrapper when supported
- common timestamps and interval normalization
- explicit missing-data handling
- no invented interpolation
- provider coverage recorded independently
- underlying/reference series kept distinct from wrapper series

Target chart modes:

- raw wrapper token price
- share-adjusted comparison, only after token/share-ratio semantics are explicitly verified
- indexed-to-100 comparison for relative tracking

### 3. Company Profile & Fundamentals

Target fields when supported by authoritative sources:

- company name
- ticker
- description
- industry / sector
- website
- market capitalization
- 52-week high / low
- volume / average daily volume
- P/E
- P/B
- dividend yield
- latest dividend data

Unavailable fields remain `null` / `UNKNOWN`; the UI must not manufacture a PASS.

### 4. Wrapper Liquidity Intelligence

Separate current market liquidity from company fundamentals.

Target dimensions:

- current route availability
- quote vendor
- entry/exit availability
- execution friction
- current executable/liquidation value
- wrapper market/on-chain volume when supported
- optional standardized read-only probe sizes after rate-limit and semantics validation

Execution findings remain deterministic backend logic.

### 5. Dividends & Corporate Actions

Keep two concepts separate:

- **ActionGuard**: current trading restriction classification (`CLEAR | ACTIVE | UNKNOWN`)
- **Corporate-action timeline**: dividends, splits, mergers, symbol changes, suspensions or other explicit events when authoritative evidence exists

Future reconciliation may compare whether wrappers reflect the same event as the underlying:

- `MATCH`
- `MISMATCH`
- `UNKNOWN`

### 6. Related News

News is a separate evidence layer and must not be embedded into the Binance adapter unless Binance exposes a suitable authoritative endpoint.

Use a provider abstraction such as:

```text
NewsProvider
  getCompanyNews(ticker)
```

Every item should preserve:

- source
- published timestamp
- headline
- URL
- category when available

Do not generate fictional news items.

### 7. Read-only Wallet Inspector

After the market-data foundation is stable:

- user supplies a public wallet address
- detect matching tokenized-equity holdings
- map holdings into the wrapper universe
- run the same inspection/data views against actual quantities

No seed phrase, private key, token approval, signing or transaction broadcast.

### 8. Proof v2 / Agent Layer

Later milestones:

- stronger canonical proof serialization
- explicit source manifest
- deterministic local verification tooling
- optional on-chain proof anchoring
- agent-friendly inspection / x402 only after the underlying data contracts are stable

## Non-goal

Real swap/trade execution is not part of this roadmap. Underly remains a read-only inspection and intelligence layer unless a future product decision explicitly changes that boundary.
