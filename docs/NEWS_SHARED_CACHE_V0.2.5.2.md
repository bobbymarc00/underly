# Shared News Snapshot v0.2.5.2

Status: IMPLEMENTATION CANDIDATE.

## Problem observed live

The contextual news foundation correctly separated:

```text
landing -> market news
ticker page -> exact ticker news
```

but the smoke test called the provider twice in immediate succession:

```text
market request
ticker request
```

The ticker call intermittently returned a provider-side 502 path even though direct retries could succeed.

## New model

Both contexts now share one upstream snapshot:

```text
Alpha Vantage NEWS_SENTIMENT
topics=financial_markets
sort=LATEST
limit=1000
        |
        v
shared in-process snapshot
        |
        +--> landing: latest items
        |
        +--> /stock/NVDA:
             exact NVDA ticker_sentiment filter
             relevance-first sort
```

## Cache

Default cache TTL:

```text
3600 seconds
```

Optional override:

```text
UNDERLY_NEWS_CACHE_TTL_SECONDS
```

Default stale fallback window:

```text
86400 seconds
```

Optional override:

```text
UNDERLY_NEWS_STALE_MAX_SECONDS
```

If a refresh fails while a still-acceptable stale snapshot exists:

```text
cache.state = STALE_FALLBACK
status = AVAILABLE
```

Underly keeps serving evidence from the previous snapshot rather than manufacturing new content.

If there is no usable snapshot, the endpoint remains fail-closed with 502.

## Request coalescing

Simultaneous landing/detail requests share the same in-flight upstream promise.

This prevents a cold server process from issuing two identical provider fetches just because two local consumers requested news at nearly the same time.

## Serverless limitation

This is process-local caching.

Separate serverless instances can each maintain their own cache. A persistent cross-instance cache can be added later if production traffic requires it.

The current goal is to make the local/runtime contract stable before introducing another infrastructure dependency.
