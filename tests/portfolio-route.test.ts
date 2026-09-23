import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listBscRwaTokensMock,
  getRwaPricesMock,
  getUnderlyingMarketMock,
  getUnderlyingProfileMock,
  inspectPortfolioSnapshotWithMulticallMock,
  getConfiguredWalletRpcMock,
  getChainIdMock,
  getBlockNumberMock,
  getErc20BalanceMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getRwaPricesMock: vi.fn(),
  getUnderlyingMarketMock: vi.fn(),
  getUnderlyingProfileMock: vi.fn(),
  inspectPortfolioSnapshotWithMulticallMock: vi.fn(),
  getConfiguredWalletRpcMock: vi.fn(),
  getChainIdMock: vi.fn(),
  getBlockNumberMock: vi.fn(),
  getErc20BalanceMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
  getRwaPrices: getRwaPricesMock,
  getUnderlyingMarket: getUnderlyingMarketMock,
  getUnderlyingProfile: getUnderlyingProfileMock,
}));

vi.mock("@/lib/wallet/provider", () => ({
  getConfiguredWalletRpc: getConfiguredWalletRpcMock,
}));

vi.mock("@/lib/portfolio/multicall", () => ({
  inspectPortfolioSnapshotWithMulticall:
    inspectPortfolioSnapshotWithMulticallMock,
  PORTFOLIO_MULTICALL_BATCH_SIZE: 100,
  PORTFOLIO_MULTICALL_CONCURRENCY: 3,
  PORTFOLIO_MULTICALL_TIMEOUT_MS: 10_000,
}));

import { GET } from "@/app/api/portfolio/route";
import { clearPortfolioProfileCache } from "@/lib/portfolio/source";
import { inspectWalletSnapshot } from "@/lib/wallet/inspector";

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WRAPPER_A = "0x1111111111111111111111111111111111111111";
const WRAPPER_B = "0x2222222222222222222222222222222222222222";

function request(address = WALLET) {
  return new Request(`http://localhost:3000/api/portfolio?address=${address}`) as never;
}

function universeRows() {
  return [
    {
      underlyingTicker: "NVDA",
      underlyingFullName: "NVIDIA Corp",
      platformId: "provider-a",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_A,
      tokenSymbol: "NVDAx",
      decimals: 6,
      tokenToShareRatio: "0.5",
      tokenPrice: "10",
      referencePrice: "20",
      statusInfo: { openState: true, marketStatus: "open" },
    },
    {
      underlyingTicker: "AMD",
      underlyingFullName: "Advanced Micro Devices",
      platformId: "provider-b",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_B,
      tokenSymbol: "AMDx",
      decimals: 18,
      tokenToShareRatio: "1",
      tokenPrice: "12",
      referencePrice: "12",
      statusInfo: { openState: true, marketStatus: "open" },
    },
    {
      underlyingTicker: "NVDA",
      underlyingFullName: "Duplicate casing row",
      platformId: "duplicate",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_A.toUpperCase(),
      tokenSymbol: "DUP",
      decimals: 18,
    },
    {
      underlyingTicker: "WRONG",
      platformId: "other-chain",
      binanceChainId: "1",
      tokenContractAddress: "0x3333333333333333333333333333333333333333",
      tokenSymbol: "WRONGx",
      decimals: 18,
    },
  ];
}

function successfulMetadata(contract: string) {
  const row = universeRows().find(
    (item) => item.tokenContractAddress === contract,
  )!;
  getRwaPricesMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: [
      {
        tokenContractAddress: contract,
        tokenPrice: row.tokenPrice,
        referencePrice: row.referencePrice,
      },
    ],
  });
  getUnderlyingMarketMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: {
      binanceChainId: "56",
      tokenContractAddress: contract,
      statusInfo: row.statusInfo,
      marketData: { referencePrice: row.referencePrice },
    },
  });
  getUnderlyingProfileMock.mockResolvedValueOnce({
    code: 0,
    msg: "success",
    data: {
      binanceChainId: "56",
      tokenContractAddress: contract,
      underlyingTicker: row.underlyingTicker,
      tokenToShareRatio: row.tokenToShareRatio,
      protections: {
        dailyAttestationReport: { supported: true },
        monthlyAttestationReport: { supported: true },
      },
    },
  });
}

describe("GET /api/portfolio v0.7-A", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPortfolioProfileCache();
    getConfiguredWalletRpcMock.mockReturnValue({
      status: "CONFIGURED",
      rpc: {
        getChainId: getChainIdMock,
        getBlockNumber: getBlockNumberMock,
        getErc20Balance: getErc20BalanceMock,
      },
    });
    getChainIdMock.mockResolvedValue("0x38");
    getBlockNumberMock.mockResolvedValue("0xabc");
    inspectPortfolioSnapshotWithMulticallMock.mockImplementation(
      async (args: {
        address: string;
        blockTag: string;
        wrappers: Parameters<typeof inspectWalletSnapshot>[0]["wrappers"];
      }) => {
        const result = await inspectWalletSnapshot({
          address: args.address,
          blockTag: args.blockTag,
          wrappers: args.wrappers,
          rpc: {
            getChainId: getChainIdMock,
            getBlockNumber: getBlockNumberMock,
            getErc20Balance: getErc20BalanceMock,
          },
          concurrency: 10,
        });
        return {
          ...result,
          multicall: {
            address: "0xca11bde05977b3631167028862be2a173976ca11",
            contractCodeVerified: true,
            contractCodeChecks: 1,
            batchCalls: Math.ceil(args.wrappers.length / 100),
            batchSize: 100,
            concurrency: 3,
            timeoutMs: 10_000,
          },
        };
      },
    );
    listBscRwaTokensMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: universeRows(),
    });
  });

  it("validates the public wallet before any provider call", async () => {
    expect((await GET(request("0x1234"))).status).toBe(400);
    expect(getConfiguredWalletRpcMock).not.toHaveBeenCalled();
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("uses one explicit block for every balance and enriches only positive wrappers", async () => {
    getErc20BalanceMock.mockImplementation(async (contract: string) =>
      contract === WRAPPER_A
        ? { rawHex: "0x16e360", baseUnits: "1500000" }
        : { rawHex: "0x0", baseUnits: "0" },
    );
    successfulMetadata(WRAPPER_A);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.snapshot).toMatchObject({
      rpcChainId: "56",
      blockTag: "0xabc",
      blockNumber: "2748",
      blockTimestamp: null,
      blockTimestampStatus: "UNAVAILABLE",
    });
    expect(payload.universe).toMatchObject({
      receivedCount: 4,
      validatedWrapperCount: 2,
      rejectedCount: 0,
    });
    expect(payload.positions[0]).toMatchObject({
      underlying: { identity: "BINANCE_RWA:56:NVDA", ticker: "NVDA" },
      balance: { rawBaseUnits: "1500000", quantity: "1.5" },
      equivalence: { underlyingEquivalentShares: "0.75" },
      valuation: { indicativeValueUsd: "15" },
    });
    expect(payload.balanceChecks).toEqual([
      expect.objectContaining({ contractAddress: WRAPPER_B, status: "ZERO" }),
      expect.objectContaining({ contractAddress: WRAPPER_A, status: "POSITIVE" }),
    ]);
    expect(getErc20BalanceMock).toHaveBeenCalledTimes(2);
    for (const call of getErc20BalanceMock.mock.calls) {
      expect(call[1]).toBe(WALLET);
      expect(call[2]).toBe("0xabc");
    }
    expect(getRwaPricesMock).toHaveBeenCalledTimes(1);
    expect(getRwaPricesMock).toHaveBeenCalledWith("56", [WRAPPER_A]);
    expect(payload.readOnly).toMatchObject({
      rpcMethods: [
        "eth_chainId",
        "eth_blockNumber",
        "eth_getCode",
        "eth_call",
      ],
      transactionMethods: [],
      signatureRequired: false,
      approvalRequired: false,
      quoteRequested: false,
      transactionBuilt: false,
      simulationRequested: false,
    });
    expect(payload.performance.calls.rpc).toEqual({
      chainVerification: 1,
      blockSnapshot: 1,
      multicallContractCode: 1,
      balanceBatches: 1,
      balanceOfInnerCalls: 2,
    });
    expect(payload.performance.controls).toMatchObject({
      balanceStrategy: "VERIFIED_BSC_MULTICALL3",
      multicallBatchSize: 100,
      multicallConcurrency: 3,
      multicallTimeoutMs: 10_000,
      multicallContractCodeVerified: true,
      balanceCache: "DISABLED",
    });
  });

  it("batches exact positive wrapper contracts into one documented price request", async () => {
    getErc20BalanceMock.mockResolvedValue({ rawHex: "0x1", baseUnits: "1" });
    getRwaPricesMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: universeRows().slice(0, 2).map((row) => ({
        tokenContractAddress: row.tokenContractAddress,
        tokenPrice: row.tokenPrice,
        referencePrice: row.referencePrice,
      })),
    });
    getUnderlyingMarketMock.mockImplementation(
      async (_chainId: string, contract: string) => ({
        code: 0,
        msg: "success",
        data: {
          binanceChainId: "56",
          tokenContractAddress: contract,
          statusInfo: { openState: true, marketStatus: "open" },
        },
      }),
    );
    getUnderlyingProfileMock.mockImplementation(
      async (_chainId: string, contract: string) => {
        const row = universeRows().find(
          (item) => item.tokenContractAddress === contract,
        )!;
        return {
          code: 0,
          msg: "success",
          data: {
            binanceChainId: "56",
            tokenContractAddress: contract,
            underlyingTicker: row.underlyingTicker,
            tokenToShareRatio: row.tokenToShareRatio,
          },
        };
      },
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.positions).toHaveLength(2);
    expect(getRwaPricesMock).toHaveBeenCalledTimes(1);
    expect(getRwaPricesMock).toHaveBeenCalledWith(
      "56",
      expect.arrayContaining([WRAPPER_A, WRAPPER_B]),
    );
    expect(payload.performance.calls.provider.price).toMatchObject({
      calls: 1,
      itemCount: 2,
      cacheHits: 0,
    });
    expect(getUnderlyingProfileMock).toHaveBeenCalledTimes(2);
    expect(
      getUnderlyingProfileMock.mock.calls.map((call) => call[1]),
    ).toEqual(expect.arrayContaining([WRAPPER_A, WRAPPER_B]));
  });

  it("keeps per-contract metadata enrichment within its bounded concurrency", async () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({
      underlyingTicker: `M${index}`,
      underlyingFullName: `Metadata ${index}`,
      platformId: "provider",
      binanceChainId: "56",
      tokenContractAddress: `0x${(index + 101).toString(16).padStart(40, "0")}`,
      tokenSymbol: `M${index}x`,
      decimals: 18,
      tokenToShareRatio: "1",
      tokenPrice: "1",
      referencePrice: "1",
    }));
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: rows,
    });
    getErc20BalanceMock.mockResolvedValue({ rawHex: "0x1", baseUnits: "1" });
    getRwaPricesMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: rows.map((row) => ({
        tokenContractAddress: row.tokenContractAddress,
        tokenPrice: row.tokenPrice,
        referencePrice: row.referencePrice,
      })),
    });
    let activeMarkets = 0;
    let maximumMarkets = 0;
    getUnderlyingMarketMock.mockImplementation(
      async (_chainId: string, contract: string) => {
        activeMarkets += 1;
        maximumMarkets = Math.max(maximumMarkets, activeMarkets);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeMarkets -= 1;
        return {
          code: 0,
          msg: "success",
          data: {
            binanceChainId: "56",
            tokenContractAddress: contract,
            statusInfo: { openState: true, marketStatus: "open" },
          },
        };
      },
    );
    getUnderlyingProfileMock.mockImplementation(
      async (_chainId: string, contract: string) => {
        const row = rows.find((item) => item.tokenContractAddress === contract)!;
        return {
          code: 0,
          msg: "success",
          data: {
            binanceChainId: "56",
            tokenContractAddress: contract,
            underlyingTicker: row.underlyingTicker,
            tokenToShareRatio: "1",
          },
        };
      },
    );

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.positions).toHaveLength(9);
    expect(maximumMarkets).toBeGreaterThan(1);
    expect(maximumMarkets).toBeLessThanOrEqual(4);
    expect(payload.performance.controls.metadataEntryConcurrency).toBe(4);
    expect(getRwaPricesMock).toHaveBeenCalledTimes(1);
  });

  it("reuses only validated public profile metadata while balances stay block-fresh", async () => {
    getBlockNumberMock
      .mockResolvedValueOnce("0xabc")
      .mockResolvedValueOnce("0xabd");
    getErc20BalanceMock.mockImplementation(async (contract: string) =>
      contract === WRAPPER_A
        ? { rawHex: "0xf4240", baseUnits: "1000000" }
        : { rawHex: "0x0", baseUnits: "0" },
    );
    getRwaPricesMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: [
        {
          tokenContractAddress: WRAPPER_A,
          tokenPrice: "10",
          referencePrice: "20",
        },
      ],
    });
    getUnderlyingMarketMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "56",
        tokenContractAddress: WRAPPER_A,
        statusInfo: { openState: true, marketStatus: "open" },
      },
    });
    getUnderlyingProfileMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "56",
        tokenContractAddress: WRAPPER_A,
        underlyingTicker: "NVDA",
        tokenToShareRatio: "0.5",
      },
    });

    const first = await GET(request());
    const second = await GET(request());
    const secondPayload = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(getErc20BalanceMock).toHaveBeenCalledTimes(4);
    expect(getErc20BalanceMock.mock.calls.map((call) => call[2])).toEqual([
      "0xabc",
      "0xabc",
      "0xabd",
      "0xabd",
    ]);
    expect(getRwaPricesMock).toHaveBeenCalledTimes(2);
    expect(getUnderlyingMarketMock).toHaveBeenCalledTimes(2);
    expect(getUnderlyingProfileMock).toHaveBeenCalledTimes(1);
    expect(secondPayload.performance.calls.provider.profile).toMatchObject({
      calls: 0,
      cacheHits: 1,
    });
    expect(secondPayload.positions[0].evidence.sources.profile.reason).toMatch(
      /^CACHE_HIT;OBSERVED_AT=.*;TTL_MS=300000$/,
    );
  });

  it("returns a partial portfolio and never maps an RPC failure to zero", async () => {
    getErc20BalanceMock.mockImplementation(async (contract: string) => {
      if (contract === WRAPPER_A) {
        return { rawHex: "0xf4240", baseUnits: "1000000" };
      }
      throw new Error("balance unavailable");
    });
    successfulMetadata(WRAPPER_A);

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.summary).toMatchObject({
      positiveBalanceCount: 1,
      provenZeroBalanceCount: 0,
      failedBalanceCount: 1,
    });
    expect(payload.balanceChecks).toContainEqual(
      expect.objectContaining({
        contractAddress: WRAPPER_B,
        status: "RPC_ERROR",
        error: "RPC_BALANCE_READ_FAILED",
      }),
    );
  });

  it("preserves partial provider evidence instead of fabricating valuation", async () => {
    const rows = universeRows();
    delete rows[0].tokenPrice;
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: rows,
    });
    getErc20BalanceMock.mockImplementation(async (contract: string) =>
      contract === WRAPPER_A
        ? { rawHex: "0xf4240", baseUnits: "1000000" }
        : { rawHex: "0x0", baseUnits: "0" },
    );
    getRwaPricesMock.mockResolvedValueOnce({
      code: 429,
      msg: "rate limited",
      data: null,
    });
    getUnderlyingMarketMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "56",
        tokenContractAddress: WRAPPER_A,
        statusInfo: { openState: true, marketStatus: "open" },
        marketData: { referencePrice: "20" },
      },
    });
    getUnderlyingProfileMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "56",
        tokenContractAddress: WRAPPER_A,
        underlyingTicker: "NVDA",
        tokenToShareRatio: "0.5",
        protections: {
          dailyAttestationReport: { supported: true },
          monthlyAttestationReport: { supported: true },
        },
      },
    });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.positions[0].valuation).toMatchObject({
      tokenPriceUsd: null,
      indicativeValueUsd: null,
      status: "ERROR",
    });
    expect(payload.positions[0].evidence.sources.price).toEqual({
      source: "BINANCE_RWA_PRICE",
      status: "ERROR",
      reason: "UPSTREAM_429",
    });
  });

  it("marks mismatched provider response identity invalid", async () => {
    getErc20BalanceMock.mockImplementation(async (contract: string) =>
      contract === WRAPPER_A
        ? { rawHex: "0xf4240", baseUnits: "1000000" }
        : { rawHex: "0x0", baseUnits: "0" },
    );
    getRwaPricesMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [{ tokenContractAddress: WRAPPER_B, tokenPrice: "999" }],
    });
    getUnderlyingMarketMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "1",
        tokenContractAddress: WRAPPER_A,
        statusInfo: { openState: true },
      },
    });
    getUnderlyingProfileMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: {
        binanceChainId: "56",
        tokenContractAddress: WRAPPER_B,
        underlyingTicker: "NVDA",
      },
    });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.positions[0].evidence.sources).toMatchObject({
      price: { status: "INVALID", reason: "PRICE_CONTRACT_MISMATCH" },
      market: { status: "INVALID", reason: "MARKET_IDENTITY_MISMATCH" },
      profile: { status: "INVALID", reason: "PROFILE_IDENTITY_MISMATCH" },
    });
    expect(payload.positions[0].valuation.tokenPriceUsd).toBe("10");
    expect(payload.positions[0].evidence.tokenPrice).toMatchObject({
      source: "BINANCE_RWA_UNIVERSE",
      status: "AVAILABLE",
    });
  });

  it("fails closed on RPC chain mismatch", async () => {
    getChainIdMock.mockResolvedValueOnce("0x1");
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe("RPC_CHAIN_MISMATCH");
    expect(getBlockNumberMock).not.toHaveBeenCalled();
    expect(getErc20BalanceMock).not.toHaveBeenCalled();
  });

  it("does not report AVAILABLE when a BSC universe row is rejected", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        ...universeRows(),
        {
          underlyingTicker: "BROKEN",
          platformId: "provider-c",
          binanceChainId: "56",
          tokenContractAddress: "not-an-address",
          tokenSymbol: "BROKENx",
          decimals: 18,
        },
      ],
    });
    getErc20BalanceMock.mockResolvedValue({ rawHex: "0x0", baseUnits: "0" });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.universe).toMatchObject({
      validatedWrapperCount: 2,
      rejectedCount: 1,
    });
    expect(payload.universe.rejected).toContainEqual({
      contractAddress: "not-an-address",
      reason: "INVALID_CONTRACT_ADDRESS",
    });
  });

  it("keeps the new API dependency boundary read-only", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/app/api/portfolio/route.ts"),
      "utf8",
    );
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/portfolio/source.ts"),
      "utf8",
    );
    const joined = `${route}\n${source}`;

    expect(joined).not.toMatch(/from\s+["'][^"']*(trading|preflight|execution)[^"']*["']/i);
    expect(joined).not.toMatch(/eth_sendTransaction|eth_sendRawTransaction|personal_sign|eth_signTypedData/i);
    expect(joined).not.toMatch(/\b(signTransaction|sendTransaction|broadcastTransaction|approveErc20)\s*\(/);
    expect(route).toContain("transactionMethods: []");
  });
});
