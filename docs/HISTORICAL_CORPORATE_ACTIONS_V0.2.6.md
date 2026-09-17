# Historical Corporate Actions v0.2.6

Status: candidate milestone.

## Goal

Add a read-only historical dividend + stock-split timeline without changing current Binance ActionGuard semantics.

Current status remains:

```text
GET /api/corporate-actions?ticker=NVDA
```

Historical evidence is fetched separately:

```text
GET /api/corporate-actions/history?ticker=NVDA&limit=100
```

## Source boundary

The first historical adapter is Alpha Vantage. Provider functions:

- `DIVIDENDS`
- `SPLITS`

Alpha Vantage documents `DIVIDENDS` as historical **and future declared** dividend distributions. Because this Underly endpoint is explicitly historical, rows whose ex-dividend date is later than the provider retrieval date are excluded from `events` and retained as rejected raw evidence. `SPLITS` is documented as historical split events.

The normalized Underly event contract is provider-neutral. Alpha-Vantage-specific rows remain available under source evidence rather than becoming the public schema.

## Provider-neutral event contract

Common fields:

```text
eventKey
ticker
type
eventDate
dateSemantics
dividend
split
source
```

Dividend event anchor:

```text
eventDate = source ex_dividend_date
dateSemantics = EX_DIVIDEND_DATE
```

Split event anchor:

```text
eventDate = source effective_date
dateSemantics = SPLIT_EFFECTIVE_DATE
```

Underly never synthesizes an event date. Missing or malformed anchor dates are rejected. Future rows are also excluded from this history endpoint.

## Evidence preservation

Every emitted event includes:

```text
source.provider
source.endpoint
source.symbol
source.retrievedAt
source.raw
```

Every rejected row is also retained at:

```text
sources[].rejectedRecords[].raw
```

Rejection reasons are explicit:

- `MISSING_OR_INVALID_EVENT_DATE`
- `FUTURE_EVENT_EXCLUDED`

Dividend amounts and split factors remain provider scalars. No currency, split ratio, declaration date, record date, payment date, or missing event date is invented.

## Availability semantics

```text
AVAILABLE      both DIVIDENDS and SPLITS available
PARTIAL        exactly one dataset available
UNAVAILABLE    neither dataset available
NOT_CONFIGURED ALPHAVANTAGE_API_KEY absent
```

A complete successful ticker snapshot is cached in-process. Default TTL is six hours and can be changed with:

```text
UNDERLY_CORPORATE_ACTIONS_CACHE_TTL_SECONDS
```

`0` disables reusable cache entries. Partial results are never cached, allowing a failed dataset to recover on the next request.

The existing v0.2.5.2 shared news snapshot cache remains untouched; it is specific to `NEWS_SENTIMENT` and is not reused for `DIVIDENDS`/`SPLITS`.

## ActionGuard separation

Historical events are informational evidence only. They do not:

- change `currentStatus`
- add to `currentEvents`
- set ActionGuard ACTIVE
- reinterpret ordinary market closure
- infer a present trading halt

The current endpoint advertises the dedicated historical endpoint but keeps `history.events` empty.
