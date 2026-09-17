import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAggregatorQuoteMock,
  listBscRwaTokensMock,
  searchRwaMock,
  getRwaPriceMock,
  getUnderlyingMarketMock,
  getUnderlyingProfileMock,
} = vi.hoisted(() => ({
  getAggregatorQuoteMock: vi.fn(),
  listBscRwaTokensMock: vi.fn(),
  searchRwaMock: vi.fn(),
  getRwaPriceMock: vi.fn(),
  getUnderlyingMarketMock: vi.fn(),
  getUnderlyingProfileMock: vi.fn(),
}));

vi.mock("@/lib/binance/auth", () => ({
  requiredEnv: vi.fn(() => "0x0000000000000000000000000000000000000001"),
}));

vi.mock("@/lib/binance/rwa", () => ({
  searchRwa: searchRwaMock,

  listBscRwaTokens: listBscRwaTokensMock,

  getRwaPrice: getRwaPriceMock,

  getUnderlyingMarket: getUnderlyingMarketMock,

  getUnderlyingProfile: getUnderlyingProfileMock,
}));

vi.mock("@/lib/binance/trading", () => ({
  getAggregatorQuote: getAggregatorQuoteMock,
}));

import { runFirewallCheck } from "@/lib/underly/engine";

const USDT =
  "0x55d398326f99059fF775485246999027B3197955".toLowerCase();

function sortedKeys(value: object) {
  return Object.keys(value).sort();
}

beforeEach(() => {
  getAggregatorQuoteMock.mockReset();
  listBscRwaTokensMock.mockReset();
  searchRwaMock.mockReset();
  getRwaPriceMock.mockReset();
  getUnderlyingMarketMock.mockReset();
  getUnderlyingProfileMock.mockReset();

  searchRwaMock.mockResolvedValue({
    code: 0,
    msg: "success",
    data: [
      {
        ticker: "NVDA",
        companyName: "NVIDIA",
        assets: [
          {
            binanceChainId: "56",
            platformId: "ondo",
            tokenContractAddress: "0x1111111111111111111111111111111111111111",
            tokenSymbol: "NVDAon",
            decimals: 18,
          },
        ],
      },
    ],
  });

  getRwaPriceMock.mockResolvedValue({
    code: 0,
    msg: "success",
    data: [
      {
        tokenPrice: "100",
        referencePrice: "100",
        tokenPriceUpdatedAt: "2026-09-17T00:00:00.000Z",
        referencePriceUpdatedAt: "2026-09-17T00:00:00.000Z",
      },
    ],
  });

  getUnderlyingMarketMock.mockResolvedValue({
    code: 0,
    msg: "success",
    data: {
      statusInfo: {
        openState: true,
        marketStatus: "regular",
        reasonCode: null,
        reasonMsg: null,
        nextOpenTime: null,
        nextCloseTime: null,
      },
    },
  });

  getUnderlyingProfileMock.mockResolvedValue({
    code: 0,
    msg: "success",
    data: {
      tokenToShareRatio: "1",
    },
  });

  listBscRwaTokensMock.mockResolvedValue({
    code: 0,
    msg: "success",
    data: [],
  });

  getAggregatorQuoteMock.mockImplementation(
    async ({
      amountRaw,
      fromToken,
    }: {
      amountRaw: string;
      fromToken: string;
    }) => {
      const raw = BigInt(amountRaw);

      const toTokenAmount =
        fromToken.toLowerCase() === USDT
          ? (raw / 100n).toString()
          : (raw * 100n).toString();

      return {
        code: 0,
        msg: "success",
        data: [
          {
            vendorName: "contract-test",
            toTokenAmount,
            toToken: {
              decimal: 18,
            },
          },
        ],
      };
    },
  );
});

describe("firewall response contract v0.1", () => {
  it("freezes top-level and wrapper field names", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "BUY",
      amountUsd: "1000",
    });

    expect(sortedKeys(result)).toEqual(
      [
        "version",
        "requestId",
        "checkedAt",
        "request",
        "methodology",
        "underlying",
        "wrappers",
        "proof",
      ].sort(),
    );

    expect(result.version).toBe("0.1");

    expect(sortedKeys(result.request)).toEqual(
      [
        "ticker",
        "contractAddress",
        "intent",
        "amountUsd",
        "tokenAmount",
        "amountMeaning",
        "positionInput",
        "platform",
        "chainId",
      ].sort(),
    );

    expect(result.wrappers).toHaveLength(1);

    const wrapper = result.wrappers[0];

    expect(sortedKeys(wrapper)).toEqual(
      [
        "identity",
        "passport",
        "market",
        "integrity",
        "execution",
        "valuation",
        "corporateActions",
        "findings",
        "sources",
      ].sort(),
    );

    expect(sortedKeys(wrapper.execution)).toEqual(
      [
        "benchmarkNotionalUsd",
        "methodology",
        "quantitySource",
        "tokenAmount",
        "entry",
        "exit",
        "breakdown",
        "executableValueUsd",
        "currentHaircutUsd",
        "currentHaircutPct",
        "favorableQuotedDeltaUsd",
        "quoteTimestamp",
      ].sort(),
    );

    expect(sortedKeys(wrapper.execution.breakdown)).toEqual(
      ["entry", "exit", "roundTrip"].sort(),
    );

    expect(sortedKeys(result.proof)).toEqual(
      ["proofId", "schemaVersion", "generatedAt", "dataHash"].sort(),
    );

    expect(result.proof.schemaVersion).toBe("underly-proof-v1");
    expect(result.proof.dataHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("freezes BUY execution semantics", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "BUY",
      amountUsd: "1000",
    });

    const execution = result.wrappers[0].execution;

    expect(result.request.amountMeaning).toBe("TRADE_NOTIONAL");
    expect(result.request.positionInput).toBe("USD_NOTIONAL");

    expect(execution.methodology).toBe(
      "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE",
    );

    expect(execution.quantitySource).toBe(
      "SYNTHETIC_ENTRY_OUTPUT",
    );

    expect(execution.entry.attempted).toBe(true);
    expect(execution.exit.attempted).toBe(true);

    expect(execution.breakdown.entry).not.toBeNull();
    expect(execution.breakdown.exit).not.toBeNull();
    expect(execution.breakdown.roundTrip).not.toBeNull();
  });

  it("freezes HOLD without-size semantics", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "HOLD",
    });

    const wrapper = result.wrappers[0];
    const execution = wrapper.execution;

    expect(result.request.amountMeaning).toBe("NONE");
    expect(result.request.positionInput).toBe("NONE");

    expect(execution.methodology).toBe("NOT_APPLICABLE");
    expect(execution.quantitySource).toBeNull();
    expect(execution.tokenAmount).toBeNull();

    expect(execution.entry.attempted).toBe(false);
    expect(execution.exit.attempted).toBe(false);

    expect(execution.breakdown).toEqual({
      entry: null,
      exit: null,
      roundTrip: null,
    });

    expect(execution.executableValueUsd).toBeNull();
    expect(wrapper.valuation).toBeNull();

    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });

  it("freezes exact SELL token quantity semantics", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "SELL",
      tokenAmount: "4.5",
    });

    const execution = result.wrappers[0].execution;

    expect(result.request.amountMeaning).toBe("TOKEN_QUANTITY");
    expect(result.request.positionInput).toBe("TOKEN_AMOUNT");

    expect(execution.methodology).toBe(
      "CURRENT_DIRECT_EXIT_QUOTE",
    );

    expect(execution.quantitySource).toBe("USER_SUPPLIED");
    expect(execution.tokenAmount).toBe("4.5");

    expect(execution.entry.attempted).toBe(false);
    expect(execution.exit.attempted).toBe(true);

    expect(execution.breakdown.entry).toBeNull();
    expect(execution.breakdown.exit).not.toBeNull();
    expect(execution.breakdown.roundTrip).toBeNull();
  });

  it("freezes exact COLLATERAL token quantity semantics", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "COLLATERAL",
      tokenAmount: "4.5",
    });

    const execution = result.wrappers[0].execution;

    expect(result.request.amountMeaning).toBe("TOKEN_QUANTITY");
    expect(result.request.positionInput).toBe("TOKEN_AMOUNT");

    expect(execution.methodology).toBe(
      "CURRENT_LIQUIDATION_VALUE",
    );

    expect(execution.quantitySource).toBe("USER_SUPPLIED");
    expect(execution.tokenAmount).toBe("4.5");

    expect(execution.entry.attempted).toBe(false);
    expect(execution.exit.attempted).toBe(true);

    expect(execution.breakdown.entry).toBeNull();
    expect(execution.breakdown.exit).not.toBeNull();
    expect(execution.breakdown.roundTrip).toBeNull();

    expect(result.wrappers[0].valuation).not.toBeNull();
  });

  it("supports contractAddress end-to-end", async () => {
    const contractAddress =
      "0x1111111111111111111111111111111111111111";

    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        {
          platformId: "ondo",
          binanceChainId: "56",
          tokenContractAddress: contractAddress,
          tokenSymbol: "NVDAon",
          decimals: 18,
          underlyingTicker: "NVDA",
          underlyingFullName: "NVIDIA",
          companyName: "NVIDIA",
          tokenToShareRatio: "1",
        },
      ],
    });

    const result = await runFirewallCheck({
      contractAddress,
      intent: "HOLD",
    });

    expect(result.version).toBe("0.1");

    expect(result.request.ticker).toBeNull();
    expect(result.request.contractAddress).toBe(contractAddress);
    expect(result.request.intent).toBe("HOLD");

    expect(result.underlying.ticker).toBe("NVDA");
    expect(result.underlying.name).toBe("NVIDIA");

    expect(result.wrappers).toHaveLength(1);

    const wrapper = result.wrappers[0];

    expect(wrapper.identity.contractAddress).toBe(contractAddress);
    expect(wrapper.identity.symbol).toBe("NVDAon");
    expect(wrapper.identity.platform).toBe("ondo");
    expect(wrapper.identity.chainId).toBe("56");

    expect(wrapper.execution.methodology).toBe("NOT_APPLICABLE");
    expect(wrapper.execution.entry.attempted).toBe(false);
    expect(wrapper.execution.exit.attempted).toBe(false);

    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });

  it("returns independent analyses for multiple wrappers", async () => {
    const ondoContract =
      "0x1111111111111111111111111111111111111111";

    const bstockContract =
      "0x2222222222222222222222222222222222222222";

    searchRwaMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        {
          ticker: "NVDA",
          companyName: "NVIDIA",
          assets: [
            {
              binanceChainId: "56",
              platformId: "ondo",
              tokenContractAddress: ondoContract,
              tokenSymbol: "NVDAon",
              decimals: 18,
            },
            {
              binanceChainId: "56",
              platformId: "bstock",
              tokenContractAddress: bstockContract,
              tokenSymbol: "NVDAB",
              decimals: 18,
            },
          ],
        },
      ],
    });

    getRwaPriceMock
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          {
            tokenPrice: "100",
            referencePrice: "100",
            tokenPriceUpdatedAt: "2026-09-17T00:00:00.000Z",
            referencePriceUpdatedAt: "2026-09-17T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "success",
        data: [
          {
            tokenPrice: "200",
            referencePrice: "190",
            tokenPriceUpdatedAt: "2026-09-17T00:00:00.000Z",
            referencePriceUpdatedAt: "2026-09-17T00:00:00.000Z",
          },
        ],
      });

    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "HOLD",
    });

    expect(result.wrappers).toHaveLength(2);

    const [ondo, bstock] = result.wrappers;

    expect(ondo.identity.symbol).toBe("NVDAon");
    expect(ondo.identity.platform).toBe("ondo");
    expect(ondo.identity.contractAddress).toBe(ondoContract);
    expect(ondo.market.tokenPriceUsd).toBe("100");

    expect(bstock.identity.symbol).toBe("NVDAB");
    expect(bstock.identity.platform).toBe("bstock");
    expect(bstock.identity.contractAddress).toBe(bstockContract);
    expect(bstock.market.tokenPriceUsd).toBe("200");

    expect(ondo.identity.contractAddress).not.toBe(
      bstock.identity.contractAddress,
    );

    expect(ondo.market.tokenPriceUsd).not.toBe(
      bstock.market.tokenPriceUsd,
    );

    expect(ondo.execution.methodology).toBe("NOT_APPLICABLE");
    expect(bstock.execution.methodology).toBe("NOT_APPLICABLE");

    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });

  it("filters ticker wrappers by platform", async () => {
    const ondoContract =
      "0x1111111111111111111111111111111111111111";

    const bstockContract =
      "0x2222222222222222222222222222222222222222";

    searchRwaMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        {
          ticker: "NVDA",
          companyName: "NVIDIA",
          assets: [
            {
              binanceChainId: "56",
              platformId: "ondo",
              tokenContractAddress: ondoContract,
              tokenSymbol: "NVDAon",
              decimals: 18,
            },
            {
              binanceChainId: "56",
              platformId: "bstock",
              tokenContractAddress: bstockContract,
              tokenSymbol: "NVDAB",
              decimals: 18,
            },
          ],
        },
      ],
    });

    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "HOLD",
      platform: "bstock",
    });

    expect(result.request.platform).toBe("bstock");
    expect(result.wrappers).toHaveLength(1);

    const wrapper = result.wrappers[0];

    expect(wrapper.identity.platform).toBe("bstock");
    expect(wrapper.identity.symbol).toBe("NVDAB");
    expect(wrapper.identity.contractAddress).toBe(bstockContract);

    expect(wrapper.identity.contractAddress).not.toBe(ondoContract);

    expect(wrapper.execution.methodology).toBe("NOT_APPLICABLE");

    expect(getRwaPriceMock).toHaveBeenCalledTimes(1);
    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });

  it("cryptographically verifies the response proof", async () => {
    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "HOLD",
    });

    const { proof, ...payloadWithoutProof } = result;

    const canonical = JSON.stringify(payloadWithoutProof);

    const hash = crypto
      .createHash("sha256")
      .update(canonical)
      .digest("hex");

    expect(proof.schemaVersion).toBe("underly-proof-v1");

    expect(proof.dataHash).toBe(`sha256:${hash}`);

    expect(proof.proofId).toBe(
      `up_${hash.slice(0, 16)}`,
    );

    expect(proof.generatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("fails closed when upstream evidence is unavailable", async () => {
    getRwaPriceMock.mockResolvedValueOnce({
      code: 500,
      msg: "price unavailable",
      data: null,
    });

    getUnderlyingMarketMock.mockResolvedValueOnce({
      code: 500,
      msg: "market unavailable",
      data: null,
    });

    getUnderlyingProfileMock.mockResolvedValueOnce({
      code: 500,
      msg: "profile unavailable",
      data: null,
    });

    const result = await runFirewallCheck({
      ticker: "NVDA",
      intent: "HOLD",
    });

    const wrapper = result.wrappers[0];

    expect(wrapper.market.tokenPriceUsd).toBeNull();
    expect(wrapper.market.referencePriceUsd).toBeNull();
    expect(wrapper.market.referenceGapPct).toBeNull();

    expect(wrapper.market.session.tradingAvailable).toBeNull();
    expect(wrapper.market.session.status).toBeNull();
    expect(wrapper.market.session.reasonCode).toBeNull();

    expect(wrapper.passport.attestation.daily).toBe("UNKNOWN");
    expect(wrapper.passport.dataCompleteness).toBe("PARTIAL");

    expect(wrapper.integrity.tokenShareRatioKnown).toBe(false);

    expect(wrapper.corporateActions.status).toBe("UNKNOWN");
    expect(wrapper.corporateActions.activeIssue).toBeNull();
    expect(wrapper.corporateActions.reason).toBe(
      "STATUS_INFO_UNAVAILABLE",
    );

    expect(wrapper.valuation).toBeNull();

    expect(wrapper.execution.methodology).toBe("NOT_APPLICABLE");
    expect(wrapper.execution.entry.attempted).toBe(false);
    expect(wrapper.execution.exit.attempted).toBe(false);

    expect(wrapper.findings.length).toBeGreaterThan(0);

    expect(getAggregatorQuoteMock).not.toHaveBeenCalled();
  });
});

