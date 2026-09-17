import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  listBscRwaTokensMock,
  getRwaPriceMock,
  getAggregatorQuoteMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getRwaPriceMock: vi.fn(),
  getAggregatorQuoteMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
  getRwaPrice: getRwaPriceMock,
}));

vi.mock("@/lib/binance/trading", () => ({
  getAggregatorQuote: getAggregatorQuoteMock,
}));

import { GET } from "@/app/api/liquidity/route";

const wrappers = [
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress:
      "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    tokenSymbol: "NVDAon",
    decimals: 18,
    tokenToShareRatio: "1.0017",
    volume24H: "100000",
  },
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "provider-x",
    binanceChainId: "56",
    tokenContractAddress:
      "0x3333333333333333333333333333333333333333",
    tokenSymbol: "NVDAX",
    decimals: 18,
    tokenToShareRatio: "1",
    volume24H: "200000",
  },
];

function mockUniverse() {
  listBscRwaTokensMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: wrappers,
  });
}

function price(tokenPrice = "200", referencePrice = "199") {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        tokenPrice,
        referencePrice,
      },
    ],
  };
}

function route(
  toTokenAmount: string,
  decimal = 18,
  vendorName = "LiquidMesh",
) {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        vendorName,
        executionMode: "STANDARD",
        toTokenAmount,
        priceImpactPercent: "0.01",
        tradeFee: "0.1",
        estimateGasFee: "0.02",
        toToken: {
          decimal,
        },
      },
    ],
  };
}

describe("/api/liquidity v0.2", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getRwaPriceMock.mockReset();
    getAggregatorQuoteMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
    vi.stubEnv(
      "UNDERLY_QUOTE_WALLET",
      "0x1111111111111111111111111111111111111111",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("validates ticker and notional", async () => {
    const missingTicker = await GET(
      new NextRequest("http://localhost/api/liquidity"),
    );
    expect(missingTicker.status).toBe(400);

    const badNotional = await GET(
      new NextRequest(
        "http://localhost/api/liquidity?ticker=NVDA&notionalUsd=0",
      ),
    );
    expect(badNotional.status).toBe(400);

    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("probes every provider dynamically and computes round-trip recovery", async () => {
    mockUniverse();
    getRwaPriceMock
      .mockResolvedValueOnce(price("200", "199"))
      .mockResolvedValueOnce(price("100", "99"));

    // Wrapper 1: $1000 -> 5 tokens -> $990
    // Wrapper 2: $1000 -> 10 tokens -> $980
    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        route("5000000000000000000"),
      )
      .mockResolvedValueOnce(
        route("990000000000000000000"),
      )
      .mockResolvedValueOnce(
        route("10000000000000000000"),
      )
      .mockResolvedValueOnce(
        route("980000000000000000000"),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/liquidity?ticker=NVDA&notionalUsd=1000",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.version).toBe("0.2");
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.summary).toEqual({
      wrapperCount: 2,
      available: 2,
      partial: 0,
      unavailable: 0,
    });

    expect(
      payload.wrappers.map(
        (item: { provider: string }) => item.provider,
      ),
    ).toEqual(["ondo", "provider-x"]);

    const ondo = payload.wrappers.find(
      (item: { provider: string }) =>
        item.provider === "ondo",
    );

    expect(ondo.probe.state).toBe("AVAILABLE");
    expect(ondo.probe.roundTrip).toMatchObject({
      benchmarkValueUsd: "1000",
      quotedValueUsd: "990",
      frictionUsd: "10",
      frictionPct: "1",
    });
    expect(
      ondo.market.reportedVolume24HComparability,
    ).toBe("UNVERIFIED_ACROSS_PROVIDERS");
  });

  it("does not attempt a reverse quote when entry liquidity is unavailable", async () => {
    mockUniverse();
    getRwaPriceMock.mockResolvedValue(price());

    getAggregatorQuoteMock
      .mockResolvedValueOnce({
        code: 40374,
        msg: "insufficient liquidity",
        data: null,
      })
      .mockResolvedValueOnce(
        route("10000000000000000000"),
      )
      .mockResolvedValueOnce(
        route("990000000000000000000"),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/liquidity?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");

    const ondo = payload.wrappers.find(
      (item: { provider: string }) =>
        item.provider === "ondo",
    );

    expect(ondo.probe.state).toBe("UNAVAILABLE");
    expect(ondo.probe.entry.errorCode).toBe(40374);
    expect(ondo.probe.exit.attempted).toBe(false);

    expect(getAggregatorQuoteMock).toHaveBeenCalledTimes(3);
  });

  it("returns PARTIAL when entry exists but the reverse route is unavailable", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [wrappers[0]],
    });
    getRwaPriceMock.mockResolvedValueOnce(price());

    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        route("5000000000000000000"),
      )
      .mockResolvedValueOnce({
        code: 40374,
        msg: "insufficient reverse liquidity",
        data: null,
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/liquidity?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.wrappers[0].probe.state).toBe("PARTIAL");
    expect(payload.wrappers[0].probe.entry.available).toBe(true);
    expect(payload.wrappers[0].probe.exit.available).toBe(false);
  });

  it("keeps the liquidity probe usable when dedicated RWA price data is unavailable", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        {
          ...wrappers[0],
          tokenPrice: undefined,
          referencePrice: undefined,
        },
      ],
    });

    getRwaPriceMock.mockResolvedValueOnce({
      code: 50001,
      msg: "price unavailable",
      data: null,
    });

    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        route("5000000000000000000"),
      )
      .mockResolvedValueOnce(
        route("990000000000000000000"),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/liquidity?ticker=NVDA",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.wrappers[0].probe.state).toBe("AVAILABLE");
    expect(payload.wrappers[0].probe.entryMark).toBeNull();
    expect(payload.wrappers[0].probe.roundTrip.quotedValueUsd).toBe(
      "990",
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
        "http://localhost/api/liquidity?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });

    expect(getRwaPriceMock).not.toHaveBeenCalled();
    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });
});
