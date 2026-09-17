import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { configuredMock, getHistoryMock } = vi.hoisted(() => ({
  configuredMock: vi.fn(),
  getHistoryMock: vi.fn(),
}));

vi.mock("@/lib/corporate-actions/provider", () => ({
  getConfiguredCorporateActionHistoryProvider: configuredMock,
}));

import { GET } from "@/app/api/corporate-actions/history/route";

function configured() {
  configuredMock.mockReturnValue({
    status: "CONFIGURED",
    provider: {
      id: "alpha_vantage",
      getHistory: getHistoryMock,
    },
  });
}

function availableResult(
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" = "AVAILABLE",
) {
  return {
    provider: "alpha_vantage",
    state,
    ticker: "NVDA",
    asOfDate: "2026-09-17",
    events: [
      {
        eventKey: "one",
        ticker: "NVDA",
        type: "DIVIDEND",
        eventDate: "2026-09-15",
        dateSemantics: "EX_DIVIDEND_DATE",
        dividend: {
          amountPerShare: "0.01",
          declarationDate: null,
          exDividendDate: "2026-09-15",
          recordDate: null,
          paymentDate: null,
        },
        split: null,
        source: {
          provider: "alpha_vantage",
          endpoint: "DIVIDENDS",
          symbol: "NVDA",
          retrievedAt: "2026-09-17T00:00:00.000Z",
          raw: {
            ex_dividend_date: "2026-09-15",
            amount: "0.01",
          },
        },
      },
    ],
    sources: [],
    cache: {
      state: "MISS",
      fetchedAt: "2026-09-17T00:00:00.000Z",
      expiresAt: "2026-09-17T06:00:00.000Z",
      reusable: true,
    },
  };
}

describe("/api/corporate-actions/history", () => {
  beforeEach(() => {
    configuredMock.mockReset();
    getHistoryMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires ticker", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/corporate-actions/history"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ticker is required",
    });
  });

  it("validates limit", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=NVDA&limit=0",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "limit must be an integer between 1 and 500",
    });
  });

  it("reports NOT_CONFIGURED without manufacturing events", async () => {
    configuredMock.mockReturnValue({
      status: "NOT_CONFIGURED",
      reason: "ALPHAVANTAGE_API_KEY is not configured.",
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("NOT_CONFIGURED");
    expect(payload.events).toEqual([]);
    expect(payload.separation.currentActionGuardEndpoint).toBe(
      "/api/corporate-actions",
    );
  });

  it("returns provider-neutral historical evidence", async () => {
    configured();
    getHistoryMock.mockResolvedValueOnce(availableResult());

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=nvda&limit=1",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.ticker).toBe("NVDA");
    expect(payload.asOfDate).toBe("2026-09-17");
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].source.raw).toEqual({
      ex_dividend_date: "2026-09-15",
      amount: "0.01",
    });
  });

  it("preserves PARTIAL state when one source dataset is unavailable", async () => {
    configured();
    getHistoryMock.mockResolvedValueOnce(availableResult("PARTIAL"));

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
  });

  it("returns 502 while preserving per-source evidence when both datasets are unavailable", async () => {
    configured();
    getHistoryMock.mockResolvedValueOnce({
      ...availableResult("UNAVAILABLE"),
      events: [],
      sources: [
        {
          provider: "alpha_vantage",
          dataset: "DIVIDENDS",
          state: "UNAVAILABLE",
          retrievedAt: "2026-09-17T00:00:00.000Z",
          recordCount: 0,
          rejectedRecordCount: 0,
          rejectedRecords: [],
          error: "dividends offline",
        },
        {
          provider: "alpha_vantage",
          dataset: "SPLITS",
          state: "UNAVAILABLE",
          retrievedAt: "2026-09-17T00:00:00.000Z",
          recordCount: 0,
          rejectedRecordCount: 0,
          rejectedRecords: [],
          error: "splits offline",
        },
      ],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.events).toEqual([]);
    expect(payload.sources).toHaveLength(2);
    expect(payload.sources[0]).toMatchObject({
      dataset: "DIVIDENDS",
      state: "UNAVAILABLE",
      error: "dividends offline",
    });
  });

  it("maps unexpected provider exceptions to 502 without inventing evidence", async () => {
    configured();
    getHistoryMock.mockRejectedValueOnce(new Error("unexpected parser failure"));

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions/history?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.events).toEqual([]);
    expect(payload.sources).toEqual([]);
    expect(payload.error).toBe("unexpected parser failure");
  });
});
