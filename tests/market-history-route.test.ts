import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listBscRwaTokensMock, getCandlesMock } = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getCandlesMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
}));

vi.mock("@/lib/binance/market", () => ({
  CANDLE_BARS: [
    "1s",
    "5s",
    "30s",
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ],
  getCandles: getCandlesMock,
}));

import { GET } from "@/app/api/market-history/route";

const wrappers = [
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "Nvidia Corp",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress:
      "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    tokenSymbol: "NVDAon",
    decimals: 18,
    tokenToShareRatio: "1",
  },
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "Nvidia Corp",
    platformId: "bstock",
    binanceChainId: "56",
    tokenContractAddress:
      "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    tokenSymbol: "NVDAB",
    decimals: 18,
    tokenToShareRatio: "1",
  },
];

function mockUniverse() {
  listBscRwaTokensMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: wrappers,
  });
}

describe("/api/market-history v0.2", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getCandlesMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires ticker", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/market-history"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ticker is required",
    });
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("validates bar, mode and time range", async () => {
    const badBar = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&bar=7m",
      ),
    );
    expect(badBar.status).toBe(400);

    const badMode = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&mode=share-adjusted",
      ),
    );
    expect(badMode.status).toBe(400);
    expect((await badMode.json()).supportedModes).toEqual([
      "raw",
      "indexed100",
    ]);

    const badRange = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&start=200&end=100",
      ),
    );
    expect(badRange.status).toBe(400);

    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("returns provider-agnostic raw candle series sorted by timestamp", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        ...wrappers,
        {
          ...wrappers[0],
          underlyingTicker: "TSLA",
          tokenContractAddress:
            "0x9999999999999999999999999999999999999999",
          tokenSymbol: "TSLAon",
        },
      ],
    });

    getCandlesMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          [102, 103, 101, 102.5, 20, 2000, 2],
          [100, 101, 99, 100.5, 10, 1000, 1],
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [[200, 201, 199, 200.5, 30, 1000, 3]],
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&bar=1h&limit=24",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.version).toBe("0.2");
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.normalization.mode).toBe("RAW_TOKEN_PRICE");
    expect(payload.summary).toEqual({
      wrapperCount: 2,
      availableSeries: 2,
      emptySeries: 0,
      unavailableSeries: 0,
    });

    expect(payload.series).toHaveLength(2);
    expect(payload.series.map((item: { provider: string }) => item.provider))
      .toEqual(["bstock", "ondo"]);

    const ondo = payload.series.find(
      (item: { provider: string }) => item.provider === "ondo",
    );

    expect(ondo.candles).toEqual([
      {
        open: "100",
        high: "101",
        low: "99",
        close: "100.5",
        volume: "10",
        timestamp: 1000,
        tradeCount: 1,
      },
      {
        open: "102",
        high: "103",
        low: "101",
        close: "102.5",
        volume: "20",
        timestamp: 2000,
        tradeCount: 2,
      },
    ]);

    expect(ondo.coverage).toEqual({
      candleCount: 2,
      firstTimestamp: 1000,
      lastTimestamp: 2000,
    });

    expect(getCandlesMock).toHaveBeenCalledTimes(2);
  });

  it("aligns raw chart points by timestamp and uses null for a missing wrapper sample", async () => {
    mockUniverse();

    getCandlesMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          [10, 10, 10, 10, 1, 1000, 1],
          [11, 11, 11, 11, 1, 2000, 1],
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [[20, 20, 20, 20, 1, 2000, 1]],
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&mode=raw",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.chart.mode).toBe("RAW_TOKEN_PRICE");
    expect(payload.chart.timeline).toEqual([1000, 2000]);
    expect(payload.chart.commonTimestampCount).toBe(1);

    const ondo = payload.chart.series.find(
      (item: { provider: string }) => item.provider === "ondo",
    );
    const bstock = payload.chart.series.find(
      (item: { provider: string }) => item.provider === "bstock",
    );

    expect(ondo.values).toEqual(["10", "11"]);
    expect(bstock.values).toEqual([null, "20"]);
  });

  it("builds indexed-100 values from the earliest timestamp shared by every available wrapper", async () => {
    mockUniverse();

    getCandlesMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          [10, 10, 10, 10, 1, 1000, 1],
          [20, 20, 20, 20, 1, 2000, 1],
          [30, 30, 30, 30, 1, 3000, 1],
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          [50, 50, 50, 50, 1, 2000, 1],
          [75, 75, 75, 75, 1, 3000, 1],
        ],
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&mode=indexed100",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.chart.mode).toBe("INDEXED_100");
    expect(payload.chart.status).toBe("AVAILABLE");
    expect(payload.chart.baselineTimestamp).toBe(2000);
    expect(payload.chart.commonTimestampCount).toBe(2);
    expect(payload.chart.timeline).toEqual([1000, 2000, 3000]);

    const ondo = payload.chart.series.find(
      (item: { provider: string }) => item.provider === "ondo",
    );
    const bstock = payload.chart.series.find(
      (item: { provider: string }) => item.provider === "bstock",
    );

    expect(ondo.baselineClose).toBe("20");
    expect(ondo.values).toEqual(["50", "100", "150"]);
    expect(bstock.baselineClose).toBe("50");
    expect(bstock.values).toEqual([null, "100", "150"]);
  });

  it("keeps indexed chart unavailable instead of inventing a baseline when no timestamp is shared", async () => {
    mockUniverse();

    getCandlesMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [[10, 10, 10, 10, 1, 1000, 1]],
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [[20, 20, 20, 20, 1, 2000, 1]],
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&mode=indexed100",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.chart).toEqual({
      mode: "INDEXED_100",
      status: "UNAVAILABLE",
      reason: "NO_COMMON_BASELINE_TIMESTAMP",
      baselineTimestamp: null,
      commonTimestampCount: 0,
      timeline: [1000, 2000],
      series: [],
    });
  });

  it("returns PARTIAL when one wrapper candle source is unavailable", async () => {
    mockUniverse();

    getCandlesMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [[100, 101, 99, 100.5, 10, 1000, 1]],
      })
      .mockResolvedValueOnce({
        code: 50001,
        msg: "history unavailable",
        data: null,
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.status).toBe("PARTIAL");
    expect(payload.summary.availableSeries).toBe(1);
    expect(payload.summary.unavailableSeries).toBe(1);
    expect(
      payload.series.some(
        (item: { status: string }) => item.status === "UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("fails closed with diagnostics when all wrapper histories are unavailable", async () => {
    mockUniverse();

    getCandlesMock.mockResolvedValue({
      code: 50001,
      msg: "history unavailable",
      data: null,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(502);
    const payload = await response.json();

    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.summary.unavailableSeries).toBe(2);
    expect(payload.series).toHaveLength(2);
    expect(payload.error).toBe(
      "Historical candle data unavailable for all wrappers",
    );
  });

  it("maps universe upstream failures to 502", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 40304,
      msg: "Service not available due to compliance restriction",
      data: null,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });

    expect(getCandlesMock).not.toHaveBeenCalled();
  });
});
