# Contextual News v0.2.5.1

Underly now uses two distinct news contexts.

## Landing page

```text
GET /api/news?scope=market&limit=10
```

The Alpha Vantage adapter requests:

```text
function=NEWS_SENTIMENT
topics=financial_markets
sort=LATEST
```

No ticker is required.

This produces a broad stock/financial-markets feed suitable for the landing page instead of pretending the landing page belongs to one company.

## Stock detail

Example:

```text
GET /api/news?scope=ticker&ticker=NVDA&limit=10
```

The provider request uses:

```text
tickers=NVDA
sort=RELEVANCE
```

Underly fetches extra candidates, then requires an exact `NVDA` row in Alpha Vantage `ticker_sentiment` metadata before an article is returned.

Final ordering:

1. ticker relevance score
2. publication time

The response preserves exact ticker evidence:

```text
relatedTickers[].ticker
relatedTickers[].relevanceScore
relatedTickers[].sentimentScore
relatedTickers[].sentimentLabel
```

There is no hard-coded relevance threshold in this milestone.

## UI behavior

A temporary functional `NewsDock` is mounted in the root layout:

- `/` => Stock market news
- `/stock/NVDA` => NVDA related news
- `/stock/MSFT` => MSFT related news

The landing news cards expose ticker links where the provider supplies ticker evidence.

The stock route is intentionally minimal because the final stock-exchange UI is still deferred until v0.2 backend contracts are stable.

## Evidence rule

Underly does not generate headlines, article text or URLs.

If the provider is not configured or unavailable, the UI shows an explicit empty/error state.
