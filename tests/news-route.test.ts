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

  it("defaults to market scope when ticker is absent", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn().mockResolvedValueOnce({
        provider: "test-news",
        items: [],
      }),
      getCompanyNews: vi.fn(),
    };

    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "CONFIGURED",
      provider,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/news?limit=8"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scope).toBe("market");
    expect(payload.ticker).toBeNull();
    expect(provider.getMarketNews).toHaveBeenCalledWith({
      limit: 8,
    });
    expect(provider.getCompanyNews).not.toHaveBeenCalled();
  });

  it("defaults to ticker scope when ticker is supplied", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn(),
      getCompanyNews: vi.fn().mockResolvedValueOnce({
        provider: "test-news",
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

  it("supports explicit market scope", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn().mockResolvedValueOnce({
        provider: "test-news",
        items: [],
      }),
      getCompanyNews: vi.fn(),
    };

    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "CONFIGURED",
      provider,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=market&limit=10",
      ),
    );

    expect(response.status).toBe(200);
    expect(provider.getMarketNews).toHaveBeenCalledTimes(1);
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

  it("returns NOT_CONFIGURED without fabricating news", async () => {
    getConfiguredNewsProviderMock.mockReturnValueOnce({
      status: "NOT_CONFIGURED",
      provider: null,
      reason: "UNDERLY_NEWS_PROVIDER is not configured",
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/news?scope=market",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("NOT_CONFIGURED");
    expect(payload.items).toEqual([]);
  });

  it("fails closed on provider errors", async () => {
    const provider = {
      id: "test-news",
      getMarketNews: vi.fn().mockRejectedValueOnce(
        new Error("upstream news unavailable"),
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
    expect(payload.items).toEqual([]);
    expect(payload.error).toBe("upstream news unavailable");
  });
});
