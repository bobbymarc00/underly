import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetAlphaVantageCorporateActionCacheForTests,
  AlphaVantageCorporateActionHistoryProvider,
} from "@/lib/corporate-actions/alpha-vantage";

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const dividends = {
  symbol: "NVDA",
  data: [
    {
      ex_dividend_date: "2026-09-15",
      declaration_date: "2026-08-20",
      record_date: "2026-09-15",
      payment_date: "2026-10-02",
      amount: "0.01",
    },
  ],
};

const splits = {
  symbol: "NVDA",
  data: [
    {
      effective_date: "2024-06-10",
      split_factor: "10.0",
    },
  ],
};

describe("AlphaVantageCorporateActionHistoryProvider", () => {
  beforeEach(() => {
    __resetAlphaVantageCorporateActionCacheForTests();
    vi.stubEnv("UNDERLY_CORPORATE_ACTIONS_CACHE_TTL_SECONDS", "3600");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("normalizes historical dividends and splits into one provider-neutral timeline", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson(dividends))
      .mockResolvedValueOnce(okJson(splits));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("nvda");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.state).toBe("AVAILABLE");
    expect(result.asOfDate).toBe("2026-09-17");
    expect(result.cache).toMatchObject({
      state: "MISS",
      reusable: true,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.type)).toEqual([
      "DIVIDEND",
      "STOCK_SPLIT",
    ]);

    expect(result.events[0]).toMatchObject({
      ticker: "NVDA",
      eventDate: "2026-09-15",
      dateSemantics: "EX_DIVIDEND_DATE",
      dividend: {
        amountPerShare: "0.01",
        declarationDate: "2026-08-20",
        exDividendDate: "2026-09-15",
        recordDate: "2026-09-15",
        paymentDate: "2026-10-02",
      },
      source: {
        provider: "alpha_vantage",
        endpoint: "DIVIDENDS",
        symbol: "NVDA",
        raw: dividends.data[0],
      },
    });

    expect(result.events[1]).toMatchObject({
      eventDate: "2024-06-10",
      dateSemantics: "SPLIT_EFFECTIVE_DATE",
      split: {
        effectiveDate: "2024-06-10",
        factor: "10.0",
      },
      source: {
        endpoint: "SPLITS",
        raw: splits.data[0],
      },
    });

    const urls = fetchMock.mock.calls.map(
      (call) => new URL(String(call[0])),
    );
    expect(urls.map((url) => url.searchParams.get("function"))).toEqual([
      "DIVIDENDS",
      "SPLITS",
    ]);
    expect(
      urls.every((url) => url.searchParams.get("symbol") === "NVDA"),
    ).toBe(true);
  });

  it("reuses a complete ticker snapshot from cache", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson(dividends))
      .mockResolvedValueOnce(okJson(splits));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );

    const first = await provider.getHistory("NVDA");
    const second = await provider.getHistory("NVDA");

    expect(first.cache.state).toBe("MISS");
    expect(second.cache).toMatchObject({
      state: "HIT",
      reusable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache PARTIAL results", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(okJson(dividends))
      .mockResolvedValueOnce(okJson({ Note: "rate limit reached" }));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("NVDA");

    expect(result.state).toBe("PARTIAL");
    expect(result.cache).toMatchObject({
      state: "MISS",
      reusable: false,
      expiresAt: null,
    });
    expect(result.events).toHaveLength(1);
    expect(result.sources).toMatchObject([
      { dataset: "DIVIDENDS", state: "AVAILABLE" },
      { dataset: "SPLITS", state: "UNAVAILABLE" },
    ]);
  });

  it("preserves malformed source rows as rejected evidence instead of inventing a date", async () => {
    const raw = { amount: "0.01", payment_date: "2026-10-02" };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okJson({
          symbol: "NVDA",
          data: [raw],
        }),
      )
      .mockResolvedValueOnce(okJson({ symbol: "NVDA", data: [] }));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("NVDA");

    expect(result.events).toEqual([]);
    expect(result.sources[0]).toMatchObject({
      dataset: "DIVIDENDS",
      state: "AVAILABLE",
      recordCount: 1,
      rejectedRecordCount: 1,
      rejectedRecords: [
        {
          reason: "MISSING_OR_INVALID_EVENT_DATE",
          anchorField: "ex_dividend_date",
          raw,
        },
      ],
    });
  });

  it("excludes future declared dividends from the history timeline while preserving raw evidence", async () => {
    const futureDividend = {
      ex_dividend_date: "2026-10-02",
      declaration_date: "2026-09-10",
      record_date: "2026-10-02",
      payment_date: "2026-10-20",
      amount: "0.01",
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okJson({ symbol: "NVDA", data: [futureDividend] }),
      )
      .mockResolvedValueOnce(okJson({ symbol: "NVDA", data: [] }));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("NVDA");

    expect(result.events).toEqual([]);
    expect(result.sources[0].rejectedRecords).toMatchObject([
      {
        reason: "FUTURE_EVENT_EXCLUDED",
        anchorField: "ex_dividend_date",
        raw: futureDividend,
      },
    ]);
  });

  it("returns UNAVAILABLE with per-source errors when both datasets fail", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("dividends offline"))
      .mockRejectedValueOnce(new Error("splits offline"));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("NVDA");

    expect(result.state).toBe("UNAVAILABLE");
    expect(result.events).toEqual([]);
    expect(result.cache).toMatchObject({
      state: "MISS",
      reusable: false,
      expiresAt: null,
    });
    expect(result.sources).toMatchObject([
      {
        dataset: "DIVIDENDS",
        state: "UNAVAILABLE",
        error: "dividends offline",
      },
      {
        dataset: "SPLITS",
        state: "UNAVAILABLE",
        error: "splits offline",
      },
    ]);
  });

  it("fails a malformed dataset closed instead of silently dropping non-object rows", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        okJson({ symbol: "NVDA", data: ["not-an-object"] }),
      )
      .mockResolvedValueOnce(okJson({ symbol: "NVDA", data: [] }));

    const provider = new AlphaVantageCorporateActionHistoryProvider(
      "test-key",
    );
    const result = await provider.getHistory("NVDA");

    expect(result.state).toBe("PARTIAL");
    expect(result.sources).toMatchObject([
      {
        dataset: "DIVIDENDS",
        state: "UNAVAILABLE",
        error: expect.stringContaining("data[0] is not an object"),
      },
      { dataset: "SPLITS", state: "AVAILABLE" },
    ]);
  });
});
