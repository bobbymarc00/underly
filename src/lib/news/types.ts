export type NewsScope = "market" | "ticker";

export interface NewsTickerEvidence {
  ticker: string;
  relevanceScore: string | null;
  sentimentScore: string | null;
  sentimentLabel: string | null;
}

export interface NewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  topics: string[];
  relatedTickers: NewsTickerEvidence[];
}

export interface MarketNewsQuery {
  limit: number;
}

export interface CompanyNewsQuery {
  ticker: string;
  limit: number;
}

export type NewsCacheState =
  | "MISS"
  | "HIT"
  | "STALE_FALLBACK";

export interface NewsCacheMeta {
  state: NewsCacheState;
  fetchedAt: string;
  expiresAt: string;
  itemCount: number;
}

export interface NewsProviderResult {
  provider: string;
  items: NewsItem[];
  cache: NewsCacheMeta;
}

export interface NewsProvider {
  readonly id: string;
  getMarketNews(query: MarketNewsQuery): Promise<NewsProviderResult>;
  getCompanyNews(query: CompanyNewsQuery): Promise<NewsProviderResult>;
}
