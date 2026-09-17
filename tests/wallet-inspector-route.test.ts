import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  listBscRwaTokensMock,
  getConfiguredWalletRpcMock,
  getChainIdMock,
  getBlockNumberMock,
  getErc20BalanceMock,
} = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
  getConfiguredWalletRpcMock: vi.fn(),
  getChainIdMock: vi.fn(),
  getBlockNumberMock: vi.fn(),
  getErc20BalanceMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
}));

vi.mock("@/lib/wallet/provider", () => ({
  getConfiguredWalletRpc: getConfiguredWalletRpcMock,
}));

import { GET } from "@/app/api/wallet-inspector/route";

const WALLET = "0x1111111111111111111111111111111111111111";
const WRAPPER_A = "0x2222222222222222222222222222222222222222";
const WRAPPER_B = "0x3333333333333333333333333333333333333333";

function request(address = WALLET) {
  return new Request(
    `http://localhost:3000/api/wallet-inspector?address=${address}`,
  ) as never;
}

function universeRows() {
  return [
    {
      underlyingTicker: "NVDA",
      underlyingFullName: "Nvidia Corp",
      platformId: "ondo",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_A,
      tokenSymbol: "NVDAon",
      decimals: 18,
      tokenToShareRatio: "1",
    },
    {
      underlyingTicker: "TSLA",
      underlyingFullName: "Tesla Inc",
      platformId: "provider-x",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_B,
      tokenSymbol: "TSLAX",
      decimals: 6,
      tokenToShareRatio: "0.5",
    },
    {
      underlyingTicker: "NVDA",
      platformId: "duplicate",
      binanceChainId: "56",
      tokenContractAddress: WRAPPER_A.toUpperCase(),
      tokenSymbol: "DUP",
      decimals: 18,
    },
    {
      underlyingTicker: "ETHONLY",
      platformId: "other-chain",
      binanceChainId: "1",
      tokenContractAddress: "0x4444444444444444444444444444444444444444",
      tokenSymbol: "ETHONLY",
      decimals: 18,
    },
  ];
}

describe("/api/wallet-inspector v0.2.7", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    getConfiguredWalletRpcMock.mockReset();
    getChainIdMock.mockReset();
    getBlockNumberMock.mockReset();
    getErc20BalanceMock.mockReset();

    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
    vi.stubEnv("UNDERLY_RPC_URL", "https://rpc.example/SECRET_KEY");

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
    listBscRwaTokensMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: universeRows(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a valid public EVM address", async () => {
    const missing = await GET(
      new Request("http://localhost:3000/api/wallet-inspector") as never,
    );
    expect(missing.status).toBe(400);

    const invalid = await GET(request("0x1234"));
    expect(invalid.status).toBe(400);
    expect(getConfiguredWalletRpcMock).not.toHaveBeenCalled();
  });

  it("fails closed when configured chain id is invalid", async () => {
    vi.stubEnv("UNDERLY_CHAIN_ID", "not-a-chain");

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe("NOT_CONFIGURED");
    expect(payload.note).toContain("UNDERLY_CHAIN_ID");
    expect(payload.readOnly.transactionMethods).toEqual([]);
    expect(getConfiguredWalletRpcMock).not.toHaveBeenCalled();
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("fails closed when RPC is not configured", async () => {
    getConfiguredWalletRpcMock.mockReturnValueOnce({
      status: "NOT_CONFIGURED",
      reason: "UNDERLY_RPC_URL is required for read-only on-chain balance inspection.",
    });
    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.status).toBe("NOT_CONFIGURED");
    expect(payload.readOnly.transactionMethods).toEqual([]);
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
  });

  it("rejects RPC chain mismatch before reading balances", async () => {
    getChainIdMock.mockResolvedValueOnce("0x1");

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe("RPC_CHAIN_MISMATCH");
    expect(payload.expectedChainId).toBe("56");
    expect(payload.observedRpcChainId).toBe("1");
    expect(getBlockNumberMock).not.toHaveBeenCalled();
    expect(listBscRwaTokensMock).not.toHaveBeenCalled();
    expect(getErc20BalanceMock).not.toHaveBeenCalled();
  });

  it("maps non-zero known wrapper balances at one explicit block", async () => {
    getErc20BalanceMock.mockImplementation(async (contract: string, _wallet: string, block: string) => {
      if (contract === WRAPPER_A) {
        return {
          rawHex: "0xde0b6b3a7640000",
          baseUnits: "1000000000000000000",
        };
      }
      return { rawHex: "0x0", baseUnits: "0" };
    });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("AVAILABLE");
    expect(payload.snapshot).toEqual({
      rpcChainId: "56",
      blockTag: "0xabc",
      blockNumber: "2748",
    });
    expect(payload.summary).toEqual({
      knownWrapperCount: 2,
      successfulChecks: 2,
      failedChecks: 0,
      holdingCount: 1,
    });
    expect(payload.holdings).toEqual([
      expect.objectContaining({
        ticker: "NVDA",
        platform: "ondo",
        symbol: "NVDAon",
        contractAddress: WRAPPER_A,
        balanceBaseUnits: "1000000000000000000",
        quantity: "1",
        evidence: {
          blockTag: "0xabc",
          rawBalanceHex: "0xde0b6b3a7640000",
        },
      }),
    ]);
    expect(getErc20BalanceMock).toHaveBeenCalledTimes(2);
    for (const call of getErc20BalanceMock.mock.calls) {
      expect(call[1]).toBe(WALLET);
      expect(call[2]).toBe("0xabc");
    }
    expect(JSON.stringify(payload)).not.toContain("SECRET_KEY");
    expect(payload.readOnly.transactionMethods).toEqual([]);
  });

  it("preserves partial balance failures without fabricating holdings", async () => {
    getErc20BalanceMock.mockImplementation(async (contract: string) => {
      if (contract === WRAPPER_A) {
        return { rawHex: "0x1", baseUnits: "1" };
      }
      throw new Error("read unavailable");
    });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("PARTIAL");
    expect(payload.summary).toMatchObject({
      successfulChecks: 1,
      failedChecks: 1,
      holdingCount: 1,
    });
    expect(payload.checks.find((item: { status: string }) => item.status === "ERROR")).toMatchObject({
      rawBalanceHex: null,
      balanceBaseUnits: null,
      quantity: null,
      error: "read unavailable",
    });
  });

  it("returns 502 when every known wrapper balance read fails", async () => {
    getErc20BalanceMock.mockRejectedValue(new Error("RPC read unavailable"));

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.holdings).toEqual([]);
    expect(payload.summary.failedChecks).toBe(2);
  });

  it("maps Binance universe business errors to 502", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 40304,
      msg: "Service not available due to compliance restriction",
      data: null,
    });

    const response = await GET(request());
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.status).toBe("UNAVAILABLE");
    expect(payload.upstreamCode).toBe(40304);
    expect(getErc20BalanceMock).not.toHaveBeenCalled();
  });
});
