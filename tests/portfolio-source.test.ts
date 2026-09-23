import { describe, expect, it } from "vitest";

import { preparePortfolioUniverse } from "@/lib/portfolio/source";

const VALID = "0x1111111111111111111111111111111111111111";
const MISSING_IDENTITY = "0x2222222222222222222222222222222222222222";

describe("portfolio universe validation", () => {
  it("requires explicit source-backed identity and excludes wrong-chain assets", () => {
    const result = preparePortfolioUniverse(
      [
        {
          underlyingTicker: "nvda",
          underlyingFullName: "NVIDIA Corp",
          platformId: "provider-a",
          binanceChainId: "56",
          tokenContractAddress: VALID,
          tokenSymbol: "NVDAx",
          decimals: 18,
        },
        {
          platformId: "provider-b",
          binanceChainId: "56",
          tokenContractAddress: MISSING_IDENTITY,
          tokenSymbol: "NVDA",
          decimals: 18,
        },
        {
          underlyingTicker: "NVDA",
          platformId: "other-chain",
          binanceChainId: "1",
          tokenContractAddress: "0x3333333333333333333333333333333333333333",
          tokenSymbol: "NVDAx",
          decimals: 18,
        },
        {
          underlyingTicker: "AMD",
          platformId: "provider-c",
          binanceChainId: "56",
          tokenContractAddress: "not-an-address",
          tokenSymbol: "AMDx",
          decimals: 18,
        },
      ],
      "56",
    );

    expect(result.entries).toEqual([
      expect.objectContaining({
        underlyingIdentity: "BINANCE_RWA:56:NVDA",
        underlyingTicker: "NVDA",
        wrapper: expect.objectContaining({ contractAddress: VALID }),
      }),
    ]);
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        {
          contractAddress: MISSING_IDENTITY,
          reason: "UNDERLYING_IDENTITY_UNAVAILABLE",
        },
        {
          contractAddress: "not-an-address",
          reason: "INVALID_CONTRACT_ADDRESS",
        },
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(
      "0x3333333333333333333333333333333333333333",
    );
  });
});
