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

describe("/api/market-history requested-window enforcement", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getCandlesMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");

    listBscRwaTokensMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: wrappers,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drops normalized candles outside explicit start/end even when upstream returns them", async () => {
    getCandlesMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: [
        [90, 90, 90, 90, 1, 900, 1],
        [100, 100, 100, 100, 1, 1000, 1],
        [150, 150, 150, 150, 1, 1500, 1],
        [200, 200, 200, 200, 1, 2000, 1],
        [210, 210, 210, 210, 1, 2100, 1],
      ],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&bar=1m&limit=60&start=1000&end=2000",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.range).toEqual({
      start: 1000,
      end: 2000,
    });
    expect(payload.chart.timeline).toEqual([1000, 1500, 2000]);

    for (const series of payload.series) {
      expect(series.coverage).toEqual({
        candleCount: 3,
        firstTimestamp: 1000,
        lastTimestamp: 2000,
      });
      expect(
        series.candles.map((candle: { timestamp: number }) => candle.timestamp),
      ).toEqual([1000, 1500, 2000]);
    }

    expect(getCandlesMock).toHaveBeenCalledTimes(2);
    expect(getCandlesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        start: 1000,
        end: 2000,
      }),
    );
  });

  it("returns EMPTY rather than leaking out-of-range candles when every upstream sample is outside the window", async () => {
    getCandlesMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: [
        [90, 90, 90, 90, 1, 900, 1],
        [210, 210, 210, 210, 1, 2100, 1],
      ],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/market-history?ticker=NVDA&bar=1m&limit=60&start=1000&end=2000",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("EMPTY");
    expect(payload.summary.availableSeries).toBe(0);
    expect(payload.summary.emptySeries).toBe(2);
    expect(payload.chart.timeline).toEqual([]);
    expect(payload.series.every(
      (series: { candles: unknown[] }) => series.candles.length === 0,
    )).toBe(true);
  });
});
