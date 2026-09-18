import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  listBscRwaTokensMock,
  getUnderlyingProfileMock,
  getUnderlyingMarketMock,
  getRwaPriceMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getUnderlyingProfileMock: vi.fn(),
  getUnderlyingMarketMock: vi.fn(),
  getRwaPriceMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
  getUnderlyingProfile: getUnderlyingProfileMock,
  getUnderlyingMarket: getUnderlyingMarketMock,
  getRwaPrice: getRwaPriceMock,
}));

import { GET } from "@/app/api/company/route";

const wrappers = [
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress:
      "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    tokenSymbol: "NVDAon",
    tokenToShareRatio: "1.0017",
  },
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "bstock",
    binanceChainId: "56",
    tokenContractAddress:
      "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    tokenSymbol: "NVDAB",
    tokenToShareRatio: "1.0007",
  },
];

function mockUniverse() {
  listBscRwaTokensMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: wrappers,
  });
}

function profile(companyInfo = {}) {
  return {
    code: 0,
    msg: "success",
    data: {
      underlyingTicker: "NVDA",
      underlyingFullName: "NVIDIA Corporation",
      companyInfo: {
        website: "https://www.nvidia.com",
        industry: "Technology",
        descriptionEn: "NVIDIA designs accelerated computing platforms.",
        ...companyInfo,
      },
    },
  };
}

function market(overrides = {}) {
  return {
    code: 0,
    msg: "success",
    data: {
      statusInfo: {
        openState: true,
        marketStatus: "regular",
      },
      marketData: {
        referencePrice: "217.45",
        high52W: "230",
        low52W: "86",
        marketCap: "5300000000000",
        peRatioTTM: "52.1",
        pbRatio: "48.2",
        dividendYield: "0.03",
        latestDividend: "0.01",
        ...overrides,
      },
    },
  };
}

function rwaPrice(referencePrice = "217.45") {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        tokenPrice: referencePrice,
        referencePrice,
      },
    ],
  };
}

describe("/api/company v0.2", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getUnderlyingProfileMock.mockReset();
    getUnderlyingMarketMock.mockReset();
    getRwaPriceMock.mockReset();
    getRwaPriceMock.mockResolvedValue({
      code: 50001,
      msg: "price fallback unavailable",
      data: null,
    });
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires ticker", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/company"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ticker is required",
    });
  });

  it("returns provider-specific data and consensus fields without hardcoding providers", async () => {
    mockUniverse();

    getUnderlyingProfileMock
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(profile());

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market())
      .mockResolvedValueOnce(market());

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.version).toBe("0.2");
    expect(payload.state).toBe("AVAILABLE");
    expect(payload.wrappers).toHaveLength(2);
    expect(payload.wrappers.map((item: { provider: string }) => item.provider))
      .toEqual(["bstock", "ondo"]);

    expect(payload.company.fields.website).toMatchObject({
      value: "https://www.nvidia.com",
      status: "CONSENSUS",
    });

    expect(payload.fundamentals.fields.peRatioTTM).toMatchObject({
      value: "52.1",
      status: "CONSENSUS",
    });
  });

  it("preserves conflicts instead of picking one provider value", async () => {
    mockUniverse();

    getUnderlyingProfileMock
      .mockResolvedValueOnce(profile({ industry: "Technology" }))
      .mockResolvedValueOnce(profile({ industry: "Semiconductors" }));

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market({ peRatioTTM: "52.1" }))
      .mockResolvedValueOnce(market({ peRatioTTM: "52.2" }));

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.company.fields.industry.value).toBeNull();
    expect(payload.company.fields.industry.status).toBe("CONFLICT");
    expect(payload.company.fields.industry.evidence).toHaveLength(2);

    expect(payload.fundamentals.fields.peRatioTTM.value).toBeNull();
    expect(payload.fundamentals.fields.peRatioTTM.status).toBe("CONFLICT");
  });

  it("returns PARTIAL without hiding a wrapper when one source fails", async () => {
    mockUniverse();

    getUnderlyingProfileMock
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce({
        code: 50001,
        msg: "profile unavailable",
        data: null,
      });

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market())
      .mockResolvedValueOnce(market());

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("PARTIAL");
    expect(payload.wrappers).toHaveLength(2);

    const partial = payload.wrappers.find(
      (item: { state: string }) => item.state === "PARTIAL",
    );

    expect(partial.sourceState.profile).toBe("UNAVAILABLE");
    expect(partial.sourceState.market).toBe("AVAILABLE");
  });

  it("fails closed when every wrapper profile and market source is unavailable", async () => {
    mockUniverse();

    getUnderlyingProfileMock.mockResolvedValue({
      code: 50001,
      msg: "profile unavailable",
      data: null,
    });
    getUnderlyingMarketMock.mockResolvedValue({
      code: 50002,
      msg: "market unavailable",
      data: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.state).toBe("UNAVAILABLE");
    expect(payload.wrappers).toHaveLength(2);
    expect(payload.error).toBe(
      "Company profile and fundamentals unavailable for all wrappers",
    );
  });

  it("falls back to RWA Price reference when Underlying Market omits it", async () => {
    mockUniverse();

    getUnderlyingProfileMock
      .mockResolvedValueOnce(profile())
      .mockResolvedValueOnce(profile());

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market({ referencePrice: "217.45" }))
      .mockResolvedValueOnce(market({ referencePrice: null }));

    getRwaPriceMock
      .mockResolvedValueOnce(rwaPrice("217.45"))
      .mockResolvedValueOnce(rwaPrice("217.45"));

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);

    const bstock = payload.wrappers.find(
      (item: { provider: string }) => item.provider === "bstock",
    );

    expect(bstock.fundamentals.referencePrice).toBe("217.45");
    expect(bstock.fundamentalsSource.referencePrice).toBe("RWA_PRICE");

    expect(payload.fundamentals.fields.referencePrice).toMatchObject({
      value: "217.45",
      status: "CONSENSUS",
    });
  });

  it("maps universe upstream failures to 502", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 40304,
      msg: "Service not available due to compliance restriction",
      data: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/company?ticker=NVDA"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });
  });
});
