import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { listBscRwaTokensMock } = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
}));

import { GET } from "@/app/api/universe/route";

describe("/api/universe v0.2", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("discovers providers dynamically and groups all wrappers by underlying", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
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
        {
          underlyingTicker: "NVDA",
          underlyingFullName: "Nvidia Corp",
          platformId: "provider-x",
          binanceChainId: "56",
          tokenContractAddress:
            "0x3333333333333333333333333333333333333333",
          tokenSymbol: "NVDAX",
          decimals: 18,
          tokenToShareRatio: "0.5",
        },
        {
          underlyingTicker: "TSLA",
          underlyingFullName: "Tesla Inc",
          platformId: "provider-x",
          binanceChainId: "56",
          tokenContractAddress:
            "0x4444444444444444444444444444444444444444",
          tokenSymbol: "TSLAX",
          decimals: 18,
          tokenToShareRatio: "1",
        },
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload.version).toBe("0.2");
    expect(payload.chainId).toBe("56");
    expect(payload.generatedAt).toEqual(expect.any(String));
    expect(payload.summary).toEqual({
      underlyingCount: 2,
      wrapperCount: 4,
      providerCount: 3,
    });

    expect(payload.providers).toEqual([
      { id: "bstock", wrapperCount: 1, underlyingCount: 1 },
      { id: "ondo", wrapperCount: 1, underlyingCount: 1 },
      { id: "provider-x", wrapperCount: 2, underlyingCount: 2 },
    ]);

    const nvda = payload.underlyings.find(
      (item: { ticker: string }) => item.ticker === "NVDA",
    );

    expect(nvda).toEqual({
      ticker: "NVDA",
      name: "Nvidia Corp",
      wrapperCount: 3,
      providers: ["bstock", "ondo", "provider-x"],
      wrappers: [
        {
          platform: "bstock",
          symbol: "NVDAB",
          contractAddress:
            "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
          chainId: "56",
          decimals: 18,
          tokenShareRatio: "1",
        },
        {
          platform: "ondo",
          symbol: "NVDAon",
          contractAddress:
            "0xa9ee28c80f960b889dfbd1902055218cba016f75",
          chainId: "56",
          decimals: 18,
          tokenShareRatio: "1",
        },
        {
          platform: "provider-x",
          symbol: "NVDAX",
          contractAddress:
            "0x3333333333333333333333333333333333333333",
          chainId: "56",
          decimals: 18,
          tokenShareRatio: "0.5",
        },
      ],
    });

    expect(listBscRwaTokensMock).toHaveBeenCalledWith("56");
  });

  it("filters to the configured chain and deduplicates contracts", async () => {
    const repeated = {
      underlyingTicker: "NVDA",
      underlyingFullName: "Nvidia Corp",
      platformId: "ondo",
      binanceChainId: "56",
      tokenContractAddress:
        "0xa9ee28c80f960b889dfbd1902055218cba016f75",
      tokenSymbol: "NVDAon",
      decimals: 18,
      tokenToShareRatio: "1",
    };

    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        repeated,
        { ...repeated },
        {
          ...repeated,
          binanceChainId: "1",
          tokenContractAddress:
            "0x5555555555555555555555555555555555555555",
          tokenSymbol: "NVDAETH",
        },
      ],
    });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary).toEqual({
      underlyingCount: 1,
      wrapperCount: 1,
      providerCount: 1,
    });
    expect(payload.underlyings[0].wrappers).toHaveLength(1);
  });

  it("maps Binance business errors to 502", async () => {
    listBscRwaTokensMock.mockResolvedValueOnce({
      code: 40304,
      msg: "Service not available due to compliance restriction",
      data: null,
    });

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });
  });

  it("maps thrown upstream failures to 502", async () => {
    listBscRwaTokensMock.mockRejectedValueOnce(
      new Error("upstream unavailable"),
    );

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "upstream unavailable",
    });
  });
});
