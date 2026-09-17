import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAlphaVantageNewsCacheForTests,
  AlphaVantageNewsProvider,
} from "@/lib/news/alpha-vantage";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

const feed = [
  {
    title: "NVIDIA platform update",
    source: "Example News",
    url: "https://example.com/nvda",
    time_published: "20260917T120000",
    topics: [{ topic: "Financial Markets" }],
    ticker_sentiment: [
      {
        ticker: "NVDA",
        relevance_score: "0.91",
        ticker_sentiment_score: "0.2",
        ticker_sentiment_label: "Somewhat-Bullish",
      },
    ],
  },
  {
    title: "IBM update",
    source: "Example News",
    url: "https://example.com/ibm",
    time_published: "20260917T130000",
    topics: [{ topic: "Financial Markets" }],
    ticker_sentiment: [
      {
        ticker: "IBM",
        relevance_score: "0.99",
      },
    ],
  },
];

describe("AlphaVantageNewsProvider shared snapshot", () => {
  beforeEach(() => {
    __resetAlphaVantageNewsCacheForTests();
    vi.stubEnv("UNDERLY_NEWS_CACHE_TTL_SECONDS", "3600");
    vi.stubEnv("UNDERLY_NEWS_STALE_MAX_SECONDS", "86400");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fetches one broad financial-markets snapshot", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ feed }));

    const provider = new AlphaVantageNewsProvider("test-key");
    const result = await provider.getMarketNews({ limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.cache.state).toBe("MISS");

    const requested = new URL(
      String(fetchMock.mock.calls[0][0]),
    );

    expect(requested.searchParams.get("function")).toBe(
      "NEWS_SENTIMENT",
    );
    expect(requested.searchParams.get("topics")).toBe(
      "financial_markets",
    );
    expect(requested.searchParams.get("tickers")).toBeNull();
    expect(requested.searchParams.get("sort")).toBe("LATEST");
    expect(requested.searchParams.get("limit")).toBe("1000");
  });

  it("reuses the same snapshot for market then ticker news", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ feed }));

    const provider = new AlphaVantageNewsProvider("test-key");

    const market = await provider.getMarketNews({ limit: 10 });
    const nvda = await provider.getCompanyNews({
      ticker: "NVDA",
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(market.cache.state).toBe("MISS");
    expect(nvda.cache.state).toBe("HIT");
    expect(nvda.items).toHaveLength(1);
    expect(nvda.items[0].headline).toBe(
      "NVIDIA platform update",
    );
  });

  it("requires exact ticker evidence for detail news", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({ feed }),
    );

    const provider = new AlphaVantageNewsProvider("test-key");
    const result = await provider.getCompanyNews({
      ticker: "NVDA",
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].relatedTickers[0]).toMatchObject({
      ticker: "NVDA",
      relevanceScore: "0.91",
    });
  });

  it("orders ticker items by relevance before time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({
        feed: [
          {
            title: "Newer lower relevance",
            source: "Example",
            url: "https://example.com/newer",
            time_published: "20260917T130000",
            ticker_sentiment: [
              {
                ticker: "NVDA",
                relevance_score: "0.20",
              },
            ],
          },
          {
            title: "Older higher relevance",
            source: "Example",
            url: "https://example.com/older",
            time_published: "20260917T120000",
            ticker_sentiment: [
              {
                ticker: "NVDA",
                relevance_score: "0.90",
              },
            ],
          },
        ],
      }),
    );

    const provider = new AlphaVantageNewsProvider("test-key");
    const result = await provider.getCompanyNews({
      ticker: "NVDA",
      limit: 10,
    });

    expect(result.items.map((item) => item.headline)).toEqual([
      "Older higher relevance",
      "Newer lower relevance",
    ]);
  });

  it("coalesces simultaneous snapshot requests", async () => {
    let resolveFetch!: (value: Response) => void;

    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(fetchPromise);

    const provider = new AlphaVantageNewsProvider("test-key");

    const marketPromise = provider.getMarketNews({ limit: 10 });
    const tickerPromise = provider.getCompanyNews({
      ticker: "NVDA",
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(okJson({ feed }));

    const [market, ticker] = await Promise.all([
      marketPromise,
      tickerPromise,
    ]);

    expect(market.items).toHaveLength(2);
    expect(ticker.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses stale cache when refresh fails", async () => {
    vi.stubEnv("UNDERLY_NEWS_CACHE_TTL_SECONDS", "1");

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_000_000);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ feed }));

    const provider = new AlphaVantageNewsProvider("test-key");
    const first = await provider.getMarketNews({ limit: 10 });
    expect(first.cache.state).toBe("MISS");

    nowSpy.mockReturnValue(1_002_000);
    fetchMock.mockRejectedValueOnce(
      new Error("provider temporarily unavailable"),
    );

    const second = await provider.getCompanyNews({
      ticker: "NVDA",
      limit: 10,
    });

    expect(second.cache.state).toBe("STALE_FALLBACK");
    expect(second.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not use stale cache beyond stale-max age", async () => {
    vi.stubEnv("UNDERLY_NEWS_CACHE_TTL_SECONDS", "1");
    vi.stubEnv("UNDERLY_NEWS_STALE_MAX_SECONDS", "2");

    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000_000);
    nowSpy.mockReturnValueOnce(1_000_000);

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson({ feed }));

    const provider = new AlphaVantageNewsProvider("test-key");
    await provider.getMarketNews({ limit: 10 });

    nowSpy.mockReturnValue(1_003_500);
    fetchMock.mockRejectedValueOnce(
      new Error("provider unavailable"),
    );

    await expect(
      provider.getCompanyNews({
        ticker: "NVDA",
        limit: 10,
      }),
    ).rejects.toThrow("provider unavailable");
  });

  it("deduplicates duplicate rows in the shared snapshot", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      okJson({
        feed: [feed[0], { ...feed[0], title: "Duplicate title" }],
      }),
    );

    const provider = new AlphaVantageNewsProvider("test-key");
    const result = await provider.getMarketNews({ limit: 10 });

    expect(result.items).toHaveLength(1);
  });
});
