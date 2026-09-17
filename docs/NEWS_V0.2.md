# Related News v0.2

Status: PROVIDER ABSTRACTION + FIRST ADAPTER.

## Product requirement

The final Underly stock-terminal page should show current related stock/company news.

News is not part of the Binance RWA adapter. It is an independent evidence layer.

Underly never invents articles.

## Endpoint

```text
GET /api/news?ticker=NVDA&limit=10
```

If no provider is configured:

```text
status = NOT_CONFIGURED
items = []
```

Underly does not fill the empty state with generated headlines.

## Provider abstraction

```text
NewsProvider
  getCompanyNews({ ticker, limit })
```

Normalized item:

```text
headline
source
publishedAt
url
topics[]
```

Article body/summary generation is intentionally outside this contract.

## Alpha Vantage adapter

First supported provider:

```text
UNDERLY_NEWS_PROVIDER=alphavantage
ALPHAVANTAGE_API_KEY=<secret>
```

The adapter uses Alpha Vantage `NEWS_SENTIMENT` with:

```text
tickers=<ticker>
sort=LATEST
limit=<requested limit>
```

The API key remains server-only.

Underly normalizes the provider response, removes malformed items, deduplicates URLs/timestamps and sorts latest-first.

## Future providers

The endpoint contract is provider-neutral. A different news provider can be added without changing the final UI contract.

Do not add provider-specific fields to the UI model unless they are namespaced as optional evidence.
