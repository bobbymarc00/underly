# Underly API v0.2 — Frozen Additive Foundation

Status: **FROZEN**. The contracts below are the validated v0.2 frozen backend baseline.

The existing v0.1 `/api/firewall/check` schema remains frozen and is not replaced by v0.2.

## Endpoint map

### `GET /api/universe`

Provider-agnostic Binance Web3 RWA wrapper universe for the configured chain.

Key guarantees:

- provider IDs are discovered dynamically
- unknown/future provider IDs are retained
- wrapper contracts are deduplicated
- token/share ratio and decimals remain source metadata
- upstream failure maps to HTTP 502

### `GET /api/market-history`

Historical wrapper candle series.

Frozen chart modes:

- `raw`
- `indexed100`

Guarantees:

- decimal-string financial values
- Unix-millisecond timestamps
- missing aligned samples remain `null`, never zero-filled
- wrapper failures remain independent
- all-wrapper unavailability maps to HTTP 502

Historical **share-adjusted** mode is not part of the v0.2 frozen contract because historical token/share-ratio continuity has not been established.

### `GET /api/company`

Company/profile and underlying-fundamental evidence.

Resolved field states:

- `CONSENSUS`
- `SINGLE_SOURCE`
- `CONFLICT`
- `UNKNOWN`

A conflict is not silently collapsed to one provider. All-wrapper source failure maps to HTTP 502.

### `GET /api/liquidity`

Current standardized read-only wrapper-liquidity observation.

The same USD benchmark is used for each wrapper:

```text
USDT -> wrapper quote -> full synthetic reverse quote
```

Business-level route absence or insufficient liquidity is valid market evidence and can be represented inside an HTTP 200 response as wrapper `PARTIAL`/`UNAVAILABLE`. Universe/transport failure remains an HTTP 502 condition.

This endpoint does not rank providers and does not submit an execution.

### `GET /api/corporate-actions`

Current Binance-backed ActionGuard/session + dividend snapshot evidence.

Current status and historical corporate actions remain separate concepts. Raw dividend yield remains preserved; only verified provider conventions receive an additional normalized percentage-point value.

### `GET /api/corporate-actions/history`

Provider-neutral historical event timeline.

v0.2.6 frozen event types:

- `DIVIDEND`
- `STOCK_SPLIT`

Guarantees:

- source/raw evidence is preserved
- missing/malformed dates are never inferred
- future declared dividends are not emitted as historical events
- current Binance ActionGuard is not mutated or driven by this timeline
- `UNAVAILABLE` maps to HTTP 502
- absent optional Alpha Vantage configuration is reported as `NOT_CONFIGURED` without fabricating events

Mergers, reorganizations, symbol changes, and suspensions are not claimed by the frozen v0.2.6 historical adapter.

### `GET /api/news`

Contextual financial-market or exact-ticker news from the configured provider.

Scopes:

- `market`
- `ticker`

Ticker detail requires exact ticker evidence from the source snapshot. Underly preserves source headline, timestamp, outbound URL, topics, and ticker evidence; it does not generate article text.

Optional-provider absence is represented as `NOT_CONFIGURED`. Provider failure maps to HTTP 502 `UNAVAILABLE`.

### `GET /api/wallet-inspector`

Read-only tokenized-equity holding discovery for a **public EVM address**.

Guarantees:

- RPC chain must match `UNDERLY_CHAIN_ID`
- one explicit `eth_blockNumber` snapshot per request
- every `balanceOf` uses that same block tag
- only Binance RWA-universe contracts are inspected
- failed reads remain explicit and are never treated as zero
- RPC URL is omitted from responses
- missing RPC configuration maps to HTTP 503 `NOT_CONFIGURED`
- chain/snapshot/upstream/all-check failure maps to HTTP 502 `UNAVAILABLE`
- no signing, approval, private key, or transaction method

## Status semantics

Status words are endpoint-local evidence states, not universal HTTP aliases.

| Condition | Typical HTTP |
| --- | ---: |
| valid available/partial market evidence | 200 |
| invalid request | 400 |
| ticker/wrapper not found where applicable | 404 |
| wallet RPC not configured | 503 |
| transport/all-source operational failure | 502 |
| optional news/history enrichment not configured | 200 with `NOT_CONFIGURED` payload |

## Freeze rule

The freeze applies to **schema, evidence semantics, read-only boundaries, and failure behavior**. It does not freeze live market values, provider inventory, liquidity outcomes, article lists, wallet balances, or upstream availability.
