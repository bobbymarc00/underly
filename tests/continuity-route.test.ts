import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NextRequest } from "next/server";

const {
  listBscRwaTokensMock,
  getUnderlyingProfileMock,
  getAggregatorQuoteMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getUnderlyingProfileMock: vi.fn(),
  getAggregatorQuoteMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens:
    listBscRwaTokensMock,
  getUnderlyingProfile:
    getUnderlyingProfileMock,
}));

vi.mock("@/lib/binance/trading", () => ({
  getAggregatorQuote:
    getAggregatorQuoteMock,
}));

import { POST } from "@/app/api/continuity/route";

const SOURCE =
  "0x1111111111111111111111111111111111111111";
const TARGET =
  "0x2222222222222222222222222222222222222222";
const OTHER =
  "0x3333333333333333333333333333333333333333";
const QUOTE_WALLET =
  "0x4444444444444444444444444444444444444444";
const USDT =
  "0x55d398326f99059fF775485246999027B3197955";

function request(
  body: Record<string, unknown>,
) {
  return new NextRequest(
    "http://localhost/api/continuity",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function universe() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        underlyingTicker: "NVDA",
        underlyingFullName:
          "NVIDIA Corporation",
        platformId: "source",
        binanceChainId: "56",
        tokenContractAddress: SOURCE,
        tokenSymbol: "NVDAS",
        decimals: 18,
        tokenToShareRatio: "0.01",
      },
      {
        underlyingTicker: "NVDA",
        underlyingFullName:
          "NVIDIA Corporation",
        platformId: "target",
        binanceChainId: "56",
        tokenContractAddress: TARGET,
        tokenSymbol: "NVDAT",
        decimals: 18,
        tokenToShareRatio: "0.001",
      },
      {
        underlyingTicker: "TSLA",
        platformId: "other",
        binanceChainId: "56",
        tokenContractAddress: OTHER,
        tokenSymbol: "TSLAX",
        decimals: 18,
        tokenToShareRatio: "1",
      },
    ],
  };
}

function profile(
  ratio: string | null,
) {
  return {
    code: 0,
    msg: "success",
    data: ratio
      ? {
          tokenToShareRatio: ratio,
        }
      : {},
  };
}

function exitQuote() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        quoteId: "exit-1",
        vendorName: "LiquidMesh",
        executionMode: "SWAP",
        toTokenAmount:
          "100000000000000000000",
        toToken: {
          decimal: 18,
          contractAddress: USDT,
        },
      },
    ],
  };
}

function targetQuote(
  amount = "9800000000000000000",
) {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        quoteId: "target-1",
        vendorName: "LiquidMesh",
        executionMode: "SWAP",
        toTokenAmount: amount,
        toToken: {
          decimal: 18,
          contractAddress: TARGET,
        },
      },
    ],
  };
}

describe("POST /api/continuity v0.5", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getUnderlyingProfileMock.mockReset();
    getAggregatorQuoteMock.mockReset();

    vi.stubEnv(
      "UNDERLY_CHAIN_ID",
      "56",
    );
    vi.stubEnv(
      "UNDERLY_QUOTE_WALLET",
      QUOTE_WALLET,
    );

    listBscRwaTokensMock.mockResolvedValue(
      universe(),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("measures live source-to-target underlying exposure continuity", async () => {
    getUnderlyingProfileMock
      .mockResolvedValueOnce(
        profile("0.01"),
      )
      .mockResolvedValueOnce(
        profile("0.001"),
      );

    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        exitQuote(),
      )
      .mockResolvedValueOnce(
        targetQuote(),
      );

    const response = await POST(
      request({
        sourceContractAddress: SOURCE,
        sourceTokenAmount: "1",
      }),
    );

    const payload =
      await response.json();

    expect(response.status).toBe(200);
    expect(payload.version).toBe("0.5");
    expect(payload.status).toBe(
      "AVAILABLE",
    );

    expect(
      payload.source.underlyingShares,
    ).toBe("0.01");

    expect(
      payload.source.exit.recoveredUsdt,
    ).toBe("100");

    expect(payload.targets).toHaveLength(
      1,
    );

    expect(
      payload.targets[0].quote
        .quotedTokenAmount,
    ).toBe("9.8");

    expect(
      payload.targets[0].continuity
        .targetUnderlyingShares,
    ).toBe("0.0098");

    expect(
      payload.targets[0].continuity
        .underlyingRetentionPct,
    ).toBe("98");

    expect(
      payload.targets[0].continuity
        .underlyingDeltaPct,
    ).toBe("-2");

    expect(
      payload.readOnly.transactionBuilt,
    ).toBe(false);

    expect(
      payload.readOnly.transactionBroadcast,
    ).toBe(false);
  });

  it("uses recovered USDT from the source exit as the target quote input", async () => {
    getUnderlyingProfileMock
      .mockResolvedValueOnce(
        profile("0.01"),
      )
      .mockResolvedValueOnce(
        profile("0.001"),
      );

    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        exitQuote(),
      )
      .mockResolvedValueOnce(
        targetQuote(),
      );

    await POST(
      request({
        sourceContractAddress: SOURCE,
        sourceTokenAmount: "1",
      }),
    );

    expect(
      getAggregatorQuoteMock,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        chainId: "56",
        fromToken: SOURCE,
        toToken: USDT,
        amountRaw:
          "1000000000000000000",
      }),
    );

    expect(
      getAggregatorQuoteMock,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        chainId: "56",
        fromToken: USDT,
        toToken: TARGET,
        amountRaw:
          "100000000000000000000",
      }),
    );
  });

  it("fails closed when the source exit route is unavailable", async () => {
    getUnderlyingProfileMock
      .mockResolvedValueOnce(
        profile("0.01"),
      )
      .mockResolvedValueOnce(
        profile("0.001"),
      );

    getAggregatorQuoteMock.mockResolvedValueOnce(
      {
        code: 5001,
        msg: "no route",
        data: null,
      },
    );

    const response = await POST(
      request({
        sourceContractAddress: SOURCE,
        sourceTokenAmount: "1",
      }),
    );

    const payload =
      await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe(
      "UNAVAILABLE",
    );

    expect(
      payload.source.exit.state,
    ).toBe("UNAVAILABLE");

    expect(
      payload.targets[0].continuity
        .status,
    ).toBe("UNAVAILABLE");

    expect(
      getAggregatorQuoteMock,
    ).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for an unknown source wrapper", async () => {
    const response = await POST(
      request({
        sourceContractAddress:
          "0x9999999999999999999999999999999999999999",
        sourceTokenAmount: "1",
      }),
    );

    const payload =
      await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain(
      "Source BSC tokenized-equity representation",
    );

    expect(
      getAggregatorQuoteMock,
    ).not.toHaveBeenCalled();
  });

  it("falls back to current token-list ratio evidence when profile ratio is unavailable", async () => {
    getUnderlyingProfileMock
      .mockResolvedValueOnce(
        profile(null),
      )
      .mockResolvedValueOnce(
        profile(null),
      );

    getAggregatorQuoteMock
      .mockResolvedValueOnce(
        exitQuote(),
      )
      .mockResolvedValueOnce(
        targetQuote(),
      );

    const response = await POST(
      request({
        sourceContractAddress: SOURCE,
        sourceTokenAmount: "1",
      }),
    );

    const payload =
      await response.json();

    expect(response.status).toBe(200);

    expect(
      payload.source.ratioSource,
    ).toBe("TOKEN_LIST");

    expect(
      payload.targets[0].ratioSource,
    ).toBe("TOKEN_LIST");

    expect(
      payload.targets[0].continuity
        .underlyingRetentionPct,
    ).toBe("98");
  });
});