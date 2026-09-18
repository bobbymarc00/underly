import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  listBscRwaTokensMock,
  getRwaPriceMock,
  getUnderlyingMarketMock,
  getUnderlyingProfileMock,
  getAggregatorQuoteMock,
  buildSwapTransactionMock,
  simulateEvmTransactionMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getRwaPriceMock: vi.fn(),
  getUnderlyingMarketMock: vi.fn(),
  getUnderlyingProfileMock: vi.fn(),
  getAggregatorQuoteMock: vi.fn(),
  buildSwapTransactionMock: vi.fn(),
  simulateEvmTransactionMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
  getRwaPrice: getRwaPriceMock,
  getUnderlyingMarket: getUnderlyingMarketMock,
  getUnderlyingProfile: getUnderlyingProfileMock,
}));

vi.mock("@/lib/binance/trading", () => ({
  getAggregatorQuote: getAggregatorQuoteMock,
}));

vi.mock("@/lib/binance/preflight-transaction", () => ({
  buildSwapTransaction: buildSwapTransactionMock,
}));

vi.mock("@/lib/binance/transaction", () => ({
  simulateEvmTransaction: simulateEvmTransactionMock,
}));

import { POST } from "@/app/api/preflight/route";

const WRAPPER = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";
const QUOTE_WALLET = "0x3333333333333333333333333333333333333333";
const USDT = "0x55d398326f99059fF775485246999027B3197955";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function universe() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        underlyingTicker: "NVDA",
        underlyingFullName: "NVIDIA Corporation",
        platformId: "bstock",
        binanceChainId: "56",
        tokenContractAddress: WRAPPER,
        tokenSymbol: "NVDAB",
        decimals: 18,
        tokenToShareRatio: "1",
      },
    ],
  };
}

function price() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        tokenPrice: "100",
        referencePrice: "100",
      },
    ],
  };
}

function market(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: {
      statusInfo: {
        openState: true,
        marketStatus: "regular",
        reasonCode: null,
        reasonMsg: null,
        ...overrides,
      },
    },
  };
}

function profile() {
  return {
    code: 0,
    msg: "success",
    data: {
      tokenToShareRatio: "1",
      protections: {
        dailyAttestationReport: { supported: true, url: "https://example.test/daily" },
        monthlyAttestationReport: { supported: true, url: "https://example.test/monthly" },
      },
    },
  };
}

function entryQuote() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        quoteId: "quote-1",
        vendorName: "LiquidMesh",
        executionMode: "SWAP",
        toTokenAmount: "250000000000000000",
        priceImpactPercent: "0.01",
        tradeFee: "0.01",
        estimateGasFee: "100000",
        toToken: { decimal: 18 },
      },
    ],
  };
}

function reverseQuote() {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        quoteId: "quote-2",
        vendorName: "LiquidMesh",
        executionMode: "SWAP",
        toTokenAmount: "24900000000000000000",
        toToken: { decimal: 18 },
      },
    ],
  };
}

function builtSwap() {
  return {
    code: 0,
    msg: "success",
    data: {
      executionMode: "SWAP",
      tx: {
        from: WALLET,
        to: "0x4444444444444444444444444444444444444444",
        value: "0",
        data: "0x1234",
      },
    },
  };
}

describe("POST /api/preflight v0.4", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getRwaPriceMock.mockReset();
    getUnderlyingMarketMock.mockReset();
    getUnderlyingProfileMock.mockReset();
    getAggregatorQuoteMock.mockReset();
    buildSwapTransactionMock.mockReset();
    simulateEvmTransactionMock.mockReset();

    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
    vi.stubEnv("UNDERLY_QUOTE_WALLET", QUOTE_WALLET);

    listBscRwaTokensMock.mockResolvedValue(universe());
    getRwaPriceMock.mockResolvedValue(price());
    getUnderlyingMarketMock.mockResolvedValue(market());
    getUnderlyingProfileMock.mockResolvedValue(profile());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops at quote-only REVIEW when no wallet address is supplied", async () => {
    getAggregatorQuoteMock
      .mockResolvedValueOnce(entryQuote())
      .mockResolvedValueOnce(reverseQuote());

    const response = await POST(
      request({ ticker: "NVDA", amountUsd: "25" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.version).toBe("0.4");
    expect(payload.mode).toBe("QUOTE_ONLY");
    expect(payload.status).toBe("REVIEW");
    expect(payload.candidates[0].economic.quotedUnderlyingShares).toBe("0.25");
    expect(payload.candidates[0].quote.reverse.recoveryPct).toBe("99.6");
    expect(payload.candidates[0].decision.reasons.map((item: { code: string }) => item.code))
      .toContain("SIMULATION_NOT_REQUESTED");
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("returns READY only after a successful wallet simulation with expected direction", async () => {
    getAggregatorQuoteMock
      .mockResolvedValueOnce(entryQuote())
      .mockResolvedValueOnce(reverseQuote());
    buildSwapTransactionMock.mockResolvedValueOnce(builtSwap());
    simulateEvmTransactionMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        status: "SUCCESS",
        failReason: null,
        balanceChanges: [
          { contractAddress: USDT, owner: WALLET, change: "-25000000000000000000", tokenType: "ERC20" },
          { contractAddress: WRAPPER, owner: WALLET, change: "250000000000000000", tokenType: "ERC20" },
        ],
        allowanceChanges: [],
      },
    });

    const response = await POST(
      request({ ticker: "NVDA", amountUsd: "25", walletAddress: WALLET }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.mode).toBe("WALLET_SIMULATION");
    expect(payload.status).toBe("READY");
    expect(payload.summary.ready).toBe(1);
    expect(payload.candidates[0].simulation.state).toBe("SUCCESS");
    expect(payload.candidates[0].simulation.direction).toBe("VERIFIED");
    expect(payload.readOnly.transactionBroadcast).toBe(false);
    expect(payload.readOnly.signatureRequested).toBe(false);
  });

  it("keeps an allowance failure in REVIEW and never broadcasts", async () => {
    getAggregatorQuoteMock
      .mockResolvedValueOnce(entryQuote())
      .mockResolvedValueOnce(reverseQuote());
    buildSwapTransactionMock.mockResolvedValueOnce(builtSwap());
    simulateEvmTransactionMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        status: "FAILED",
        failReason: "execution reverted: ERC20InsufficientAllowance",
        balanceChanges: [],
        allowanceChanges: [],
      },
    });

    const response = await POST(
      request({ ticker: "NVDA", amountUsd: "25", walletAddress: WALLET }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("REVIEW");
    expect(payload.candidates[0].simulation.state).toBe("ALLOWANCE_REQUIRED");
    expect(payload.candidates[0].decision.reasons.map((item: { code: string }) => item.code))
      .toContain("ALLOWANCE_REQUIRED");
    expect(payload.candidates[0].simulation.rawTransactionReturned).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("0x1234");
  });

  it("blocks an active corporate action and skips transaction construction", async () => {
    getUnderlyingMarketMock.mockResolvedValueOnce(
      market({
        openState: false,
        marketStatus: "halted",
        reasonCode: "CORPORATE_ACTION",
        reasonMsg: "Corporate action processing",
      }),
    );
    getAggregatorQuoteMock
      .mockResolvedValueOnce(entryQuote())
      .mockResolvedValueOnce(reverseQuote());

    const response = await POST(
      request({ ticker: "NVDA", amountUsd: "25", walletAddress: WALLET }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("BLOCKED");
    expect(payload.candidates[0].corporateActions.status).toBe("ACTIVE");
    expect(payload.candidates[0].simulation.state).toBe("SKIPPED_POLICY");
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("validates wallet addresses before any upstream call", async () => {
    const response = await POST(
      request({ ticker: "NVDA", amountUsd: "25", walletAddress: "0x1234" }),
    );

    expect(response.status).toBe(400);
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });
});
