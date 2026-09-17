import "server-only";

import type {
  CompanyNewsQuery,
  MarketNewsQuery,
  NewsCacheMeta,
  NewsItem,
  NewsProvider,
  NewsProviderResult,
  NewsTickerEvidence,
} from "./types";

const ORIGIN = "https://www.alphavantage.co/query";
const SNAPSHOT_LIMIT = 1000;
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60;
const DEFAULT_STALE_MAX_SECONDS = 24 * 60 * 60;

interface AlphaVantageTopic {
  topic?: string;
}

interface AlphaVantageTickerSentiment {
  ticker?: string;
  relevance_score?: string;
  ticker_sentiment_score?: string;
  ticker_sentiment_label?: string;
}

interface AlphaVantageFeedItem {
  title?: string;
  url?: string;
  time_published?: string;
  source?: string;
  topics?: AlphaVantageTopic[];
  ticker_sentiment?: AlphaVantageTickerSentiment[];
}

interface AlphaVantageNewsResponse {
  feed?: AlphaVantageFeedItem[];
  Information?: string;
  Note?: string;
  "Error Message"?: string;
}

interface SharedSnapshot {
  apiKey: string;
  items: NewsItem[];
  fetchedAtMs: number;
  expiresAtMs: number;
}

let sharedSnapshot: SharedSnapshot | null = null;
let snapshotInFlight:
  | {
      apiKey: string;
      promise: Promise<SharedSnapshot>;
    }
  | null = null;

function envPositiveInt(
  name: string,
  fallback: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function parseAlphaTimestamp(value?: string): string | null {
  if (!value) return null;

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}Z`;
  const timestamp = Date.parse(iso);

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

function validHttpUrl(value?: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function tickerEvidence(
  items?: AlphaVantageTickerSentiment[],
): NewsTickerEvidence[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const ticker = item.ticker?.trim().toUpperCase();
      if (!ticker) return null;

      return {
        ticker,
        relevanceScore: item.relevance_score?.trim() || null,
        sentimentScore:
          item.ticker_sentiment_score?.trim() || null,
        sentimentLabel:
          item.ticker_sentiment_label?.trim() || null,
      };
    })
    .filter(
      (item): item is NewsTickerEvidence => item !== null,
    );
}

function normalizeItem(
  item: AlphaVantageFeedItem,
): NewsItem | null {
  const headline = item.title?.trim();
  const source = item.source?.trim();
  const publishedAt = parseAlphaTimestamp(item.time_published);
  const url = validHttpUrl(item.url);

  if (!headline || !source || !publishedAt || !url) {
    return null;
  }

  return {
    headline,
    source,
    publishedAt,
    url,
    topics: Array.isArray(item.topics)
      ? item.topics
          .map((topic) => topic.topic?.trim())
          .filter(
            (topic): topic is string =>
              Boolean(topic && topic.length),
          )
      : [],
    relatedTickers: tickerEvidence(item.ticker_sentiment),
  };
}

function providerError(
  payload: AlphaVantageNewsResponse,
): string | null {
  return (
    payload["Error Message"] ??
    payload.Information ??
    payload.Note ??
    null
  );
}

function dedupe(items: NewsItem[]): NewsItem[] {
  const deduped = new Map<string, NewsItem>();

  for (const item of items) {
    const key = `${item.url}|${item.publishedAt}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return Array.from(deduped.values());
}

function exactTickerEvidence(
  item: NewsItem,
  ticker: string,
): NewsTickerEvidence | null {
  const target = ticker.toUpperCase();

  return (
    item.relatedTickers.find(
      (evidence) => evidence.ticker === target,
    ) ?? null
  );
}

function relevanceNumber(
  item: NewsItem,
  ticker: string,
): number {
  const evidence = exactTickerEvidence(item, ticker);
  const parsed = Number(evidence?.relevanceScore);
  return Number.isFinite(parsed) ? parsed : -1;
}

function cacheMeta(
  snapshot: SharedSnapshot,
  state: NewsCacheMeta["state"],
): NewsCacheMeta {
  return {
    state,
    fetchedAt: new Date(snapshot.fetchedAtMs).toISOString(),
    expiresAt: new Date(snapshot.expiresAtMs).toISOString(),
    itemCount: snapshot.items.length,
  };
}

async function fetchSharedSnapshot(
  apiKey: string,
): Promise<SharedSnapshot> {
  const url = new URL(ORIGIN);
  url.searchParams.set("function", "NEWS_SENTIMENT");
  url.searchParams.set("topics", "financial_markets");
  url.searchParams.set("sort", "LATEST");
  url.searchParams.set("limit", String(SNAPSHOT_LIMIT));
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(
      `Alpha Vantage returned HTTP ${response.status}`,
    );
  }

  const payload =
    (await response.json()) as AlphaVantageNewsResponse;
  const error = providerError(payload);

  if (error) {
    throw new Error(
      `Alpha Vantage news unavailable: ${error}`,
    );
  }

  const items = dedupe(
    (payload.feed ?? [])
      .map(normalizeItem)
      .filter((item): item is NewsItem => item !== null),
  ).sort(
    (a, b) =>
      Date.parse(b.publishedAt) -
      Date.parse(a.publishedAt),
  );

  const fetchedAtMs = Date.now();
  const ttlSeconds = envPositiveInt(
    "UNDERLY_NEWS_CACHE_TTL_SECONDS",
    DEFAULT_CACHE_TTL_SECONDS,
  );

  return {
    apiKey,
    items,
    fetchedAtMs,
    expiresAtMs: fetchedAtMs + ttlSeconds * 1000,
  };
}

async function getSharedSnapshot(
  apiKey: string,
): Promise<{
  snapshot: SharedSnapshot;
  state: NewsCacheMeta["state"];
}> {
  const now = Date.now();

  if (
    sharedSnapshot &&
    sharedSnapshot.apiKey === apiKey &&
    now < sharedSnapshot.expiresAtMs
  ) {
    return {
      snapshot: sharedSnapshot,
      state: "HIT",
    };
  }

  if (
    snapshotInFlight &&
    snapshotInFlight.apiKey === apiKey
  ) {
    const snapshot = await snapshotInFlight.promise;
    return {
      snapshot,
      state: "HIT",
    };
  }

  const request = fetchSharedSnapshot(apiKey);
  snapshotInFlight = {
    apiKey,
    promise: request,
  };

  try {
    const snapshot = await request;
    sharedSnapshot = snapshot;

    return {
      snapshot,
      state: "MISS",
    };
  } catch (error) {
    const staleMaxSeconds = envPositiveInt(
      "UNDERLY_NEWS_STALE_MAX_SECONDS",
      DEFAULT_STALE_MAX_SECONDS,
    );

    if (
      sharedSnapshot &&
      sharedSnapshot.apiKey === apiKey &&
      now - sharedSnapshot.fetchedAtMs <=
        staleMaxSeconds * 1000
    ) {
      return {
        snapshot: sharedSnapshot,
        state: "STALE_FALLBACK",
      };
    }

    throw error;
  } finally {
    if (snapshotInFlight?.promise === request) {
      snapshotInFlight = null;
    }
  }
}

export function __resetAlphaVantageNewsCacheForTests(): void {
  sharedSnapshot = null;
  snapshotInFlight = null;
}

export class AlphaVantageNewsProvider implements NewsProvider {
  readonly id = "alphavantage";

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("ALPHAVANTAGE_API_KEY is required");
    }
  }

  private async snapshot(): Promise<{
    items: NewsItem[];
    cache: NewsCacheMeta;
  }> {
    const { snapshot, state } =
      await getSharedSnapshot(this.apiKey);

    return {
      items: snapshot.items,
      cache: cacheMeta(snapshot, state),
    };
  }

  async getMarketNews(
    query: MarketNewsQuery,
  ): Promise<NewsProviderResult> {
    const { items, cache } = await this.snapshot();

    return {
      provider: this.id,
      items: items.slice(0, query.limit),
      cache,
    };
  }

  async getCompanyNews(
    query: CompanyNewsQuery,
  ): Promise<NewsProviderResult> {
    const ticker = query.ticker.trim().toUpperCase();
    const { items, cache } = await this.snapshot();

    const related = items
      .filter(
        (item) => exactTickerEvidence(item, ticker) !== null,
      )
      .sort((a, b) => {
        const relevanceDelta =
          relevanceNumber(b, ticker) -
          relevanceNumber(a, ticker);

        if (relevanceDelta !== 0) return relevanceDelta;

        return (
          Date.parse(b.publishedAt) -
          Date.parse(a.publishedAt)
        );
      })
      .slice(0, query.limit);

    return {
      provider: this.id,
      items: related,
      cache,
    };
  }
}
