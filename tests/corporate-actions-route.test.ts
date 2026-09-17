import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  listBscRwaTokensMock,
  getUnderlyingMarketMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getUnderlyingMarketMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
  getUnderlyingMarket: getUnderlyingMarketMock,
}));

import { GET } from "@/app/api/corporate-actions/route";

const wrappers = [
  {
    underlyingTicker: "NVDA",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress:
      "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    tokenSymbol: "NVDAon",
  },
  {
    underlyingTicker: "NVDA",
    platformId: "bstock",
    binanceChainId: "56",
    tokenContractAddress:
      "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
    tokenSymbol: "NVDAB",
  },
];

function mockUniverse() {
  listBscRwaTokensMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: wrappers,
  });
}

function market(params?: {
  openState?: boolean;
  marketStatus?: string | null;
  reasonCode?: string | null;
  reasonMsg?: string | null;
  latestDividend?: string | null;
  dividendYield?: string | null;
}) {
  return {
    code: 0,
    msg: "success",
    data: {
      statusInfo: {
        openState: params?.openState ?? true,
        marketStatus: params?.marketStatus ?? "regular",
        reasonCode: params?.reasonCode ?? null,
        reasonMsg: params?.reasonMsg ?? null,
      },
      marketData: {
        latestDividend:
          params?.latestDividend ?? "0.25",
        dividendYield:
          params?.dividendYield ?? "0.03",
      },
    },
  };
}

describe("/api/corporate-actions v0.2", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getUnderlyingMarketMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires ticker", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "ticker is required",
    });
  });

  it("keeps an ordinary closed session CLEAR and reconciles dividend snapshot", async () => {
    mockUniverse();

    getUnderlyingMarketMock
      .mockResolvedValueOnce(
        market({
          openState: false,
          marketStatus: "overnight",
          reasonCode: "MARKET_CLOSED",
        }),
      )
      .mockResolvedValueOnce(
        market({
          openState: false,
          marketStatus: "overnight",
          reasonCode: "MARKET_CLOSED",
        }),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.state).toBe("AVAILABLE");
    expect(payload.currentStatus).toMatchObject({
      agreement: "CONSENSUS",
      status: "CLEAR",
    });
    expect(payload.currentEvents).toEqual([]);
    expect(payload.dividendSnapshot.latestDividend).toMatchObject({
      value: "0.25",
      status: "CONSENSUS",
    });
    expect(payload.history).toMatchObject({
      status: "SEPARATE_ENDPOINT",
      endpoint: "/api/corporate-actions/history?ticker=NVDA",
      events: [],
    });
  });

  it("exposes current explicit corporate-action status as a current event", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [wrappers[0]],
    });

    getUnderlyingMarketMock.mockResolvedValueOnce(
      market({
        openState: false,
        marketStatus: "halted",
        reasonCode: "DIVIDEND_CORPORATE_ACTION",
        reasonMsg: "Trading paused for dividend processing",
      }),
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentStatus.status).toBe("ACTIVE");
    expect(payload.currentEvents).toHaveLength(1);
    expect(payload.currentEvents[0]).toMatchObject({
      provider: "ondo",
      symbol: "NVDAon",
      type: "CORPORATE_ACTION_HALT",
      status: "ACTIVE",
      reasonCode: "DIVIDEND_CORPORATE_ACTION",
      temporalSemantics: "CURRENT_STATUS_ONLY",
    });
  });

  it("preserves conflicting dividend snapshot values", async () => {
    mockUniverse();

    getUnderlyingMarketMock
      .mockResolvedValueOnce(
        market({ latestDividend: "0.25" }),
      )
      .mockResolvedValueOnce(
        market({ latestDividend: "0.30" }),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.dividendSnapshot.latestDividend.value).toBeNull();
    expect(payload.dividendSnapshot.latestDividend.status).toBe(
      "CONFLICT",
    );
    expect(
      payload.dividendSnapshot.latestDividend.evidence,
    ).toHaveLength(2);
  });

  it("reports action-status conflict without choosing a wrapper", async () => {
    mockUniverse();

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market())
      .mockResolvedValueOnce(
        market({
          openState: false,
          marketStatus: "halted",
          reasonCode: "SPLIT_CORPORATE_ACTION",
          reasonMsg: "Trading paused for split processing",
        }),
      );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.currentStatus.agreement).toBe("CONFLICT");
    expect(payload.currentStatus.status).toBeNull();
    expect(payload.currentEvents).toHaveLength(1);
  });

  it("returns PARTIAL and preserves the available wrapper when one market source fails", async () => {
    mockUniverse();

    getUnderlyingMarketMock
      .mockResolvedValueOnce(market())
      .mockResolvedValueOnce({
        code: 50001,
        msg: "market unavailable",
        data: null,
      });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("PARTIAL");
    expect(payload.wrappers).toHaveLength(2);
    expect(
      payload.wrappers.some(
        (wrapper: { sourceState: string }) =>
          wrapper.sourceState === "UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("fails closed when every wrapper market source is unavailable", async () => {
    mockUniverse();

    getUnderlyingMarketMock.mockResolvedValue({
      code: 50001,
      msg: "market unavailable",
      data: null,
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.state).toBe("UNAVAILABLE");
    expect(payload.error).toBe(
      "Corporate-action and dividend snapshot unavailable for all wrappers",
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
        "http://localhost/api/corporate-actions?ticker=NVDA",
      ),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error:
        "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });
  });
});
