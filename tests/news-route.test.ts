import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getConfiguredNewsProviderMock } = vi.hoisted(() => ({
  getConfiguredNewsProviderMock: vi.fn(),
}));

vi.mock("@/lib/news/provider", () => ({
  getConfiguredNewsProvider: getConfiguredNewsProviderMock,
}));

import { GET } from "@/app/api/news/route";

describe("/api/news v0.2 contextual scopes", () => {
  beforeEach(() => {
    getConfiguredNewsProviderMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves shared provider cache metadata on available responses", async () => {
    const cache = {
      status: "HIT",
      fetchedAt: "2026-09-18T08:00:00.000Z",
    };

    const provider = {
      id: "test-news",
      getMarketNews: vi.fn().mockResolvedValueOnce({
        provider: "test-news",
        cache,
        items: [],
      }),
      getCompanyNews: vi.fn(),
    };

    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "CONFIGURED",
      provider,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/news?scope=market&limit=8"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("market");
    expect(payload.cache).toEqual(cache);
    expect(provider.getMarketNews).toHaveBeenCalledWith({
      limit: 8,
    });
  });

  it("defaults to ticker scope when ticker is supplied", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn(),
      getCompanyNews: vi.fn().mockResolvedValueOnce({
        provider: "test-news",
        cache: { status: "HIT" },
        items: [],
      }),
    };

    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "CONFIGURED",
      provider,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?ticker=nvda&limit=5",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("ticker");
    expect(payload.ticker).toBe("NVDA");
    expect(provider.getCompanyNews).toHaveBeenCalledWith({
      ticker: "NVDA",
      limit: 5,
    });
  });

  it("requires ticker for explicit ticker scope", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=ticker",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ticker is required for ticker scope",
    });
    expect(getConfiguredNewsProviderMock).not.toHaveBeenCalled();
  });

  it("validates scope and limit", async () => {
    const badScope = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=crypto",
      ),
    );
    expect(badScope.status).toBe(400);

    const badLimit = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=market&limit=100",
      ),
    );
    expect(badLimit.status).toBe(400);
  });

  it("returns a deployment-safe NOT_CONFIGURED response", async () => {
    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "NOT_CONFIGURED",
      provider: null,
      reason: "ALPHAVANTAGE_API_KEY is not configured",
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=market",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("NOT_CONFIGURED");
    expect(payload.cache).toBeNull();
    expect(payload.note).toBe(
      "News is not configured for this deployment.",
    );
    expect(JSON.stringify(payload)).not.toContain(
      "ALPHAVANTAGE_API_KEY",
    );
  });

  it("fails closed without exposing raw upstream errors or credentials", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn().mockRejectedValueOnce(
        new Error(
          "Alpha Vantage news unavailable: free API rate limit; " +
            "apikey=SECRET-KEY https://www.alphavantage.co/premium/",
        ),
      ),
      getCompanyNews: vi.fn(),
    };

    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "CONFIGURED",
      provider,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=market",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.cache).toBeNull();
    expect(payload.items).toEqual([]);
    expect(payload.reasonCode).toBe(
      "PROVIDER_RATE_LIMIT",
    );
    expect(payload.message).toBe(
      "News provider rate limit reached. Try again later.",
    );

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("SECRET-KEY");
    expect(serialized).not.toContain("alphavantage.co");
    expect(serialized).not.toContain("premium");
    expect(serialized).not.toContain("Alpha Vantage news unavailable");
  });
});
