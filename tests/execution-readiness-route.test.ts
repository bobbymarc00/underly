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

import { POST } from "@/app/api/execution-readiness/route";

const WRAPPER = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";
const TARGET = "0x4444444444444444444444444444444444444444";
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const AMOUNT_RAW = "25000000000000000000";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/execution-readiness", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "NVDA",
    wrapperContractAddress: WRAPPER,
    walletAddress: WALLET,
    amountRaw: AMOUNT_RAW,
    slippagePercent: "0.5",
    ...overrides,
  };
}

function universe(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        underlyingTicker: "NVDA",
        platformId: "bstock",
        binanceChainId: "56",
        tokenContractAddress: WRAPPER,
        tokenSymbol: "NVDAB",
        decimals: 18,
        tokenToShareRatio: "1",
        ...overrides,
      },
    ],
  };
}

function price(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: [
      {
        tokenContractAddress: WRAPPER,
        tokenPrice: "100",
        referencePrice: "100",
        ...overrides,
      },
    ],
  };
}

function market(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: {
      binanceChainId: "56",
      tokenContractAddress: WRAPPER,
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

function profile(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: {
      binanceChainId: "56",
      tokenContractAddress: WRAPPER,
      underlyingTicker: "NVDA",
      tokenToShareRatio: "1",
      protections: {
        dailyAttestationReport: {
          supported: true,
          url: "https://example.test/daily",
        },
        monthlyAttestationReport: {
          supported: true,
          url: "https://example.test/monthly",
        },
      },
      ...overrides,
    },
  };
}

function entryQuote(overrides: Record<string, unknown> = {}) {
  return {
    code: 0,
    msg: "success",
    data: [
        {
          quoteId: "quote-1",
          vendorName: "LiquidMesh",
          executionMode: "SWAP",
          binanceChainId: "56",
          fromTokenAmount: AMOUNT_RAW,
          toTokenAmount: "250000000000000000",
          fromToken: { decimal: 18, tokenContractAddress: USDT },
          toToken: { decimal: 18, tokenContractAddress: WRAPPER },
        ...overrides,
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
        binanceChainId: "56",
        fromTokenAmount: "250000000000000000",
        toTokenAmount: "24900000000000000000",
        fromToken: { decimal: 18, tokenContractAddress: WRAPPER },
        toToken: { decimal: 18, tokenContractAddress: USDT },
      },
    ],
  };
}

function routerResult(overrides: Record<string, unknown> = {}) {
  return {
    quoteId: "quote-1",
    binanceChainId: "56",
    fromTokenAmount: AMOUNT_RAW,
    toTokenAmount: "250000000000000000",
    fromToken: { decimal: 18, tokenContractAddress: USDT },
    toToken: { decimal: 18, tokenContractAddress: WRAPPER },
    ...overrides,
  };
}

function builtSwap(
  txOverrides: Record<string, unknown> = {},
  dataOverrides: Record<string, unknown> = {},
) {
  return {
    code: 0,
    msg: "success",
    data: {
      executionMode: "SWAP",
      routerResult: routerResult(),
      tx: {
        from: WALLET,
        to: TARGET,
        value: "0",
        data: "0x1234",
        minReceiveAmount: "248750000000000000",
        slippagePercent: "0.5",
        ...txOverrides,
      },
      rfq: null,
      ...dataOverrides,
    },
  };
}

function successfulSimulation(
  overrides: Record<string, unknown> = {},
) {
  return {
    code: 0,
    msg: "success",
    data: {
      status: "SUCCESS",
      failReason: null,
      balanceChanges: [
        {
          contractAddress: USDT,
          owner: WALLET,
          change: `-${AMOUNT_RAW}`,
          tokenType: "ERC20",
        },
        {
          contractAddress: WRAPPER,
          owner: WALLET,
          change: "250000000000000000",
          tokenType: "ERC20",
        },
      ],
      allowanceChanges: [],
      ...overrides,
    },
  };
}

describe("POST /api/execution-readiness v0.6-B", () => {
  beforeEach(() => {
    vi.useRealTimers();
    for (const mock of [
      listBscRwaTokensMock,
      getRwaPriceMock,
      getUnderlyingMarketMock,
      getUnderlyingProfileMock,
      getAggregatorQuoteMock,
      buildSwapTransactionMock,
      simulateEvmTransactionMock,
    ]) {
      mock.mockReset();
    }

    listBscRwaTokensMock.mockResolvedValue(universe());
    getRwaPriceMock.mockResolvedValue(price());
    getUnderlyingMarketMock.mockResolvedValue(market());
    getUnderlyingProfileMock.mockResolvedValue(profile());
    getAggregatorQuoteMock.mockImplementation(
      ({ fromToken }: { fromToken: string }) =>
        Promise.resolve(fromToken === USDT ? entryQuote() : reverseQuote()),
    );
    buildSwapTransactionMock.mockResolvedValue(builtSwap());
    simulateEvmTransactionMock.mockResolvedValue(successfulSimulation());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns READY only for the exact selected, simulated wrapper", async () => {
    const response = await POST(request(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("READY");
    expect(payload.executionReadinessStatus).toBe("EXECUTION_READY");
    expect(payload.selectedWrapper.contractAddress).toBe(WRAPPER);
    expect(payload.economicExposure.quotedUnderlyingShares).toBe("0.25");
    expect(payload.quote.inputAmountRaw).toBe(AMOUNT_RAW);
    expect(payload.simulation.direction).toBe("VERIFIED");
    expect(payload.approvalEnvelope.version).toBe("underly-call-intent-v1");
    expect(payload.approvalEnvelope.scope).toBe("EVM_CALL_INTENT_ONLY");
    expect(payload.approvalEnvelope.intent.callDataHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(buildSwapTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: "56",
        amountRaw: AMOUNT_RAW,
        toToken: WRAPPER,
        wallet: WALLET,
        quoteId: "quote-1",
      }),
    );
    expect(payload.humanApprovalRequired).toBe(true);
    expect(payload.humanApprovalRequested).toBe(false);
    expect(payload.executionPermitted).toBe(false);
    expect(payload.approvalAuthorizationGranted).toBe(false);
    expect(payload.signatureRequested).toBe(false);
    expect(payload.transactionBroadcast).toBe(false);
    expect(payload.rawTransactionReturned).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("0x1234");
  });

  it("rejects a malformed request before upstream discovery", async () => {
    const response = await POST(
      request(validBody({ amountRaw: "25.0", walletAddress: "0x1234" })),
    );

    expect(response.status).toBe(400);
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong chain", { binanceChainId: "1" }, "WRONG_CHAIN"],
    ["ticker mismatch", { underlyingTicker: "TSLA" }, "TICKER_WRAPPER_MISMATCH"],
  ])("rejects %s universe evidence", async (_name, row, code) => {
    listBscRwaTokensMock.mockResolvedValueOnce(universe(row));

    const response = await POST(request(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe(code);
    expect(getRwaPriceMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown selected contract without substituting a wrapper", async () => {
    const response = await POST(
      request(
        validBody({
          wrapperContractAddress:
            "0x9999999999999999999999999999999999999999",
        }),
      ),
    );
    expect(response.status).toBe(404);
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing quote", { code: 0, msg: "success", data: [] }, "FRESH_QUOTE_UNAVAILABLE"],
    ["missing quote id", entryQuote({ quoteId: undefined }), "QUOTE_ID_UNAVAILABLE"],
    ["whitespace quote id", entryQuote({ quoteId: "   " }), "QUOTE_ID_UNAVAILABLE"],
  ])("blocks a %s", async (_name, quote, reasonCode) => {
    getAggregatorQuoteMock.mockResolvedValueOnce(quote);

    const response = await POST(request(validBody()));
    const payload = await response.json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.readiness.reasons.map((item: { code: string }) => item.code))
      .toContain(reasonCode);
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
    expect(payload.approvalEnvelope).toBeNull();
  });

  it.each([
    ["quote ID", { quoteId: undefined }],
    ["chain", { binanceChainId: undefined }],
    ["input amount", { fromTokenAmount: undefined }],
    ["source token", { fromToken: { decimal: 18 } }],
    ["destination token", { toToken: { decimal: 18 } }],
    [
      "source decimals",
      { fromToken: { decimal: undefined, tokenContractAddress: USDT } },
    ],
    [
      "destination decimals",
      { toToken: { decimal: undefined, tokenContractAddress: WRAPPER } },
    ],
  ])("blocks quote missing required %s identity", async (_name, overrides) => {
    getAggregatorQuoteMock.mockResolvedValueOnce(entryQuote(overrides));

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.quote.available).toBe(false);
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
    expect(payload.approvalEnvelope).toBeNull();
  });

  it.each([
    ["chain", { binanceChainId: "1" }],
    ["input amount", { fromTokenAmount: "1" }],
    [
      "source token",
      {
        fromToken: {
          decimal: 18,
          tokenContractAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    ],
    [
      "destination token",
      {
        toToken: {
          decimal: 18,
          tokenContractAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    ],
    [
      "destination decimals",
      { toToken: { decimal: 6, tokenContractAddress: WRAPPER } },
    ],
    ["execution mode", { executionMode: "RFQ" }],
  ])("blocks mismatched quote %s", async (_name, overrides) => {
    getAggregatorQuoteMock.mockResolvedValueOnce(entryQuote(overrides));

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.quote.available).toBe(false);
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
  });

  it("fails closed when the unsigned build uses another wallet", async () => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({ from: "0x3333333333333333333333333333333333333333" }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("TRANSACTION_FROM_MISMATCH");
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-hex"],
    ["odd-length", "0x123"],
  ])("fails closed for %s calldata", async (_name, data) => {
    buildSwapTransactionMock.mockResolvedValueOnce(builtSwap({ data }));

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe(
      "TRANSACTION_CALLDATA_INVALID",
    );
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("blocks a nonzero native transaction value", async () => {
    buildSwapTransactionMock.mockResolvedValueOnce(builtSwap({ value: "1" }));

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe(
      "TRANSACTION_NATIVE_VALUE_NOT_ALLOWED",
    );
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("blocks a build without mandatory router evidence", async () => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({}, { routerResult: undefined }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("BUILD_ROUTER_RESULT_MISSING");
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["chain", { binanceChainId: "1" }],
    ["input amount", { fromTokenAmount: "1" }],
    ["output amount", { toTokenAmount: "1" }],
    [
      "source token",
      {
        fromToken: {
          decimal: 18,
          tokenContractAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    ],
    [
      "destination token",
      {
        toToken: {
          decimal: 18,
          tokenContractAddress: "0x9999999999999999999999999999999999999999",
        },
      },
    ],
    [
      "destination decimals",
      { toToken: { decimal: 6, tokenContractAddress: WRAPPER } },
    ],
  ])("blocks mismatched build %s evidence", async (_name, overrides) => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({}, { routerResult: routerResult(overrides) }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("BUILD_EVIDENCE_CONTRADICTORY");
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["chain", { binanceChainId: undefined }],
    ["input amount", { fromTokenAmount: undefined }],
    ["output amount", { toTokenAmount: undefined }],
    ["source token", { fromToken: { decimal: 18 } }],
    ["destination token", { toToken: { decimal: 18 } }],
    [
      "source decimals",
      { fromToken: { decimal: undefined, tokenContractAddress: USDT } },
    ],
    [
      "destination decimals",
      { toToken: { decimal: undefined, tokenContractAddress: WRAPPER } },
    ],
  ])("blocks build missing required %s identity", async (_name, overrides) => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({}, { routerResult: routerResult(overrides) }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("BUILD_EVIDENCE_CONTRADICTORY");
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing target", { to: undefined }, "TRANSACTION_TARGET_INVALID"],
    [
      "zero target",
      { to: "0x0000000000000000000000000000000000000000" },
      "TRANSACTION_TARGET_INVALID",
    ],
    ["missing minimum receive", { minReceiveAmount: undefined }, "MINIMUM_RECEIVE_AMOUNT_MISMATCH"],
    ["wrong minimum receive", { minReceiveAmount: "1" }, "MINIMUM_RECEIVE_AMOUNT_MISMATCH"],
    ["wrong slippage", { slippagePercent: "1" }, "BUILD_SLIPPAGE_MISMATCH"],
    [
      "unexpected signature metadata",
      { signatureData: [] },
      "UNSUPPORTED_SIGNATURE_METADATA",
    ],
  ])("blocks a build with %s", async (_name, txOverrides, reason) => {
    buildSwapTransactionMock.mockResolvedValueOnce(builtSwap(txOverrides));

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe(reason);
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("blocks a mismatched build quote id when the provider echoes it", async () => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({}, { routerResult: routerResult({ quoteId: "other" }) }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("BUILD_QUOTE_ID_MISMATCH");
  });

  it("keeps a successful simulation blocked when the live build omits response-side quoteId", async () => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap(
        {
          gas: "450000",
          gasPrice: "60735778",
          maxPriorityFeePerGas: "60735778",
          signatureData: null,
        },
        {
          routerResult: routerResult({
            quoteId: undefined,
            vendorName: "LiquidMesh",
            router: `${USDT.toLowerCase()}--${WRAPPER.toLowerCase()}`,
            dexRouterList: [
              {
                dexProtocol: { dexName: "Rfq Neptune", percent: "100.00" },
                fromToken: { tokenContractAddress: USDT.toLowerCase() },
                toToken: { tokenContractAddress: WRAPPER.toLowerCase() },
              },
            ],
          }),
        },
      ),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.available).toBe(true);
    expect(payload.build.identityBindingConfirmed).toBe(false);
    expect(payload.build.validationReason).toBe("BUILD_QUOTE_ID_UNCONFIRMED");
    expect(payload.simulation.state).toBe("SUCCESS");
    expect(payload.simulation.direction).toBe("VERIFIED");
    expect(payload.readiness.reasons).toContainEqual(
      expect.objectContaining({
        code: "BUILD_QUOTE_ID_UNCONFIRMED",
        severity: "BLOCK",
      }),
    );
    expect(payload.readiness.humanApprovalRequested).toBe(false);
    expect(payload.humanApprovalRequested).toBe(false);
    expect(payload.approvalEnvelope).toBeNull();
    expect(simulateEvmTransactionMock).toHaveBeenCalledWith({
      chainId: "56",
      tx: {
        from: WALLET,
        to: TARGET,
        value: "0",
        data: "0x1234",
      },
    });
  });

  it.each([
    ["missing", undefined],
    ["mismatched", "RFQ"],
  ])("blocks a build with %s execution mode", async (_name, executionMode) => {
    buildSwapTransactionMock.mockResolvedValueOnce(
      builtSwap({}, { executionMode }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.build.validationReason).toBe("BUILD_EVIDENCE_CONTRADICTORY");
  });

  it("blocks an active corporate action before building", async () => {
    getUnderlyingMarketMock.mockResolvedValueOnce(
      market({
        openState: false,
        marketStatus: "halted",
        reasonCode: "CORPORATE_ACTION",
        reasonMsg: "Split processing",
      }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.corporateActions.status).toBe("ACTIVE");
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
    expect(simulateEvmTransactionMock).not.toHaveBeenCalled();
  });

  it("keeps unknown integrity and market evidence in REVIEW", async () => {
    getUnderlyingMarketMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: { binanceChainId: "56", tokenContractAddress: WRAPPER },
    });
    getUnderlyingProfileMock.mockResolvedValueOnce(
      profile({ protections: undefined }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("REVIEW");
    expect(payload.preflight.reasons.map((item: { code: string }) => item.code))
      .toEqual(
        expect.arrayContaining([
          "ACTIONGUARD_UNKNOWN",
          "INTEGRITY_INCOMPLETE",
          "UNDERLYING_SESSION_UNKNOWN",
        ]),
      );
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("blocks an exceeded user reference-gap guard before building", async () => {
    getRwaPriceMock.mockResolvedValueOnce(price({ tokenPrice: "120" }));

    const payload = await (
      await POST(request(validBody({ maxReferenceGapPct: "5" })))
    ).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.preflight.reasons.map((item: { code: string }) => item.code))
      .toContain("REFERENCE_GUARD_EXCEEDED");
    expect(buildSwapTransactionMock).not.toHaveBeenCalled();
  });

  it("keeps a missing reverse route in REVIEW", async () => {
    getAggregatorQuoteMock
      .mockResolvedValueOnce(entryQuote())
      .mockResolvedValueOnce({ code: 0, msg: "success", data: [] });

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("REVIEW");
    expect(payload.preflight.reasons.map((item: { code: string }) => item.code))
      .toContain("EXIT_ROUTE_UNOBSERVED");
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("keeps allowance-required simulation in REVIEW", async () => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({
        status: "FAILED",
        failReason: "ERC20InsufficientAllowance",
        balanceChanges: [],
      }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("REVIEW");
    expect(payload.simulation.state).toBe("ALLOWANCE_REQUIRED");
    expect(payload.approvalEnvelope).toBeNull();
  });

  it.each([
    ["failed", "FAILED", "reverted"],
    ["contradictory failReason", "SUCCESS", "execution reverted"],
  ])("blocks a %s simulation", async (_name, status, failReason) => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({ status, failReason }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.simulation.state).toBe("FAILED");
    expect(payload.approvalEnvelope).toBeNull();
  });

  it.each([
    [
      "contradictory",
      [
        { contractAddress: USDT, owner: WALLET, change: "1" },
        { contractAddress: WRAPPER, owner: WALLET, change: "1" },
      ],
      "BLOCKED",
      "CONTRADICTORY",
    ],
    [
      "incomplete",
      [{ contractAddress: USDT, owner: WALLET, change: "-1" }],
      "REVIEW",
      "INCOMPLETE",
    ],
  ])(
    "fails closed for %s balance direction",
    async (_name, balanceChanges, expectedStatus, expectedDirection) => {
      simulateEvmTransactionMock.mockResolvedValueOnce(
        successfulSimulation({ balanceChanges }),
      );

      const payload = await (await POST(request(validBody()))).json();

      expect(payload.status).toBe(expectedStatus);
      expect(payload.simulation.direction).toBe(expectedDirection);
      expect(payload.approvalEnvelope).toBeNull();
    },
  );

  it.each([
    [
      "wrong spend amount",
      [
        {
          contractAddress: USDT,
          owner: WALLET,
          change: "-50000000000000000000",
          tokenType: "ERC20",
        },
        {
          contractAddress: WRAPPER,
          owner: WALLET,
          change: "250000000000000000",
          tokenType: "ERC20",
        },
      ],
      "SPEND_AMOUNT_MISMATCH",
    ],
    [
      "wrapper amount below slippage minimum",
      [
        {
          contractAddress: USDT,
          owner: WALLET,
          change: `-${AMOUNT_RAW}`,
          tokenType: "ERC20",
        },
        {
          contractAddress: WRAPPER,
          owner: WALLET,
          change: "248749999999999999",
          tokenType: "ERC20",
        },
      ],
      "RECEIVE_AMOUNT_BELOW_MINIMUM",
    ],
    [
      "extra token debit",
      [
        ...successfulSimulation().data.balanceChanges,
        {
          contractAddress: "0x9999999999999999999999999999999999999999",
          owner: WALLET,
          change: "-1",
          tokenType: "ERC20",
        },
      ],
      "UNEXPECTED_WALLET_TOKEN_DEBIT",
    ],
    [
      "extra native debit",
      [
        ...successfulSimulation().data.balanceChanges,
        {
          owner: WALLET,
          change: "-1",
          tokenType: "NATIVE",
        },
      ],
      "UNEXPECTED_NATIVE_ASSET_DEBIT",
    ],
  ])("blocks successful simulation with %s", async (_name, changes, reason) => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({ balanceChanges: changes }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.simulation.direction).toBe("CONTRADICTORY");
    expect(payload.simulation.effectValidationReason).toBe(reason);
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("blocks an allowance increase", async () => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({
        allowanceChanges: [
          {
            tokenAddress: USDT,
            owner: WALLET,
            spender: TARGET,
            preAmount: "0",
            postAmount: AMOUNT_RAW,
          },
        ],
      }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.simulation.effectValidationReason).toBe(
      "ALLOWANCE_INCREASE_NOT_ALLOWED",
    );
  });

  it("accepts the exact allowance consumption returned by the live provider", async () => {
    const preAmount =
      115792089237316195423570985008687907853269984665640564039244364274391830789891n;
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({
        balanceChanges: successfulSimulation().data.balanceChanges.map(
          (change: Record<string, unknown>) => ({
            ...change,
            tokenType: "Erc20",
          }),
        ),
        allowanceChanges: [
          {
            tokenAddress: USDT.toLowerCase(),
            owner: WALLET,
            spender: TARGET.toLowerCase(),
            preAmount: preAmount.toString(),
            postAmount: (preAmount - BigInt(AMOUNT_RAW)).toString(),
          },
        ],
      }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("READY");
    expect(payload.simulation.direction).toBe("VERIFIED");
    expect(payload.simulation.effectValidationReason).toBeNull();
  });

  it.each([
    ["different spender", { spender: "0x9999999999999999999999999999999999999999" }, "UNEXPECTED_ALLOWANCE_MUTATION"],
    ["wrong decrease", { postAmount: "1" }, "ALLOWANCE_DECREASE_MISMATCH"],
  ])("blocks allowance consumption with %s", async (_name, overrides, reason) => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({
        allowanceChanges: [
          {
            tokenAddress: USDT,
            owner: WALLET,
            spender: TARGET,
            preAmount: AMOUNT_RAW,
            postAmount: "0",
            ...overrides,
          },
        ],
      }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.simulation.effectValidationReason).toBe(reason);
  });

  it("keeps missing simulation balance evidence out of EXECUTION_READY", async () => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({ balanceChanges: undefined }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("REVIEW");
    expect(payload.simulation.direction).toBe("INCOMPLETE");
    expect(payload.simulation.effectValidationReason).toBe(
      "SIMULATION_EFFECT_EVIDENCE_MISSING",
    );
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("keeps missing simulation allowance evidence out of EXECUTION_READY", async () => {
    simulateEvmTransactionMock.mockResolvedValueOnce(
      successfulSimulation({ allowanceChanges: undefined }),
    );

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("REVIEW");
    expect(payload.simulation.direction).toBe("INCOMPLETE");
    expect(payload.simulation.effectValidationReason).toBe(
      "SIMULATION_EFFECT_EVIDENCE_MISSING",
    );
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("rejects a snapshot that expires during upstream processing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T00:00:00.000Z"));
    simulateEvmTransactionMock.mockImplementationOnce(() => {
      vi.setSystemTime(new Date("2026-09-20T00:01:00.000Z"));
      return Promise.resolve(successfulSimulation());
    });

    const payload = await (await POST(request(validBody()))).json();

    expect(payload.status).toBe("BLOCKED");
    expect(payload.snapshotFresh).toBe(false);
    expect(payload.readiness.reasons.map((item: { code: string }) => item.code))
      .toContain("SNAPSHOT_EXPIRED");
    expect(payload.approvalEnvelope).toBeNull();
  });

  it("never signs, authorizes, broadcasts, or returns an executable transaction", async () => {
    const payload = await (await POST(request(validBody()))).json();
    const serialized = JSON.stringify(payload);
    const keys = new Set<string>();
    const collectKeys = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        keys.add(key);
        collectKeys(child);
      }
    };
    collectKeys(payload);

    expect(payload.humanApprovalRequired).toBe(true);
    expect(payload.humanApprovalRequested).toBe(false);
    expect(payload.approvalAuthorizationGranted).toBe(false);
    expect(payload.executionPermitted).toBe(false);
    expect(payload.signatureRequested).toBe(false);
    expect(payload.transactionBroadcast).toBe(false);
    expect(payload.rawTransactionReturned).toBe(false);
    expect(payload.build.calldataReturned).toBe(false);
    expect(serialized).not.toContain("0x1234");
    expect(serialized).not.toContain('"data"');
    expect(keys).not.toContain("tx");
    expect(keys).not.toContain("data");
    expect(keys).not.toContain("calldata");
    expect(keys).not.toContain("rawTransaction");
    expect(simulateEvmTransactionMock).toHaveBeenCalledWith({
      chainId: "56",
      tx: {
        from: WALLET,
        to: TARGET,
        value: "0",
        data: "0x1234",
      },
    });
  });
});
