import { describe, expect, it } from "vitest";

import {
  buildUnifiedPortfolio,
  type PortfolioAssetMetadata,
  type PortfolioBalanceInput,
  type PortfolioEvidenceRef,
} from "@/lib/underly/portfolio";

const CONTRACT_A = "0x1111111111111111111111111111111111111111";
const CONTRACT_B = "0x2222222222222222222222222222222222222222";
const CONTRACT_C = "0x3333333333333333333333333333333333333333";

function available(source = "TEST"): PortfolioEvidenceRef {
  return { source, status: "AVAILABLE", reason: null };
}

function missing(source = "TEST", reason = "UNAVAILABLE"): PortfolioEvidenceRef {
  return { source, status: "UNAVAILABLE", reason };
}

function asset(
  contractAddress: string,
  overrides: Partial<PortfolioAssetMetadata> = {},
): PortfolioAssetMetadata {
  const base: PortfolioAssetMetadata = {
    chainId: "56",
    contractAddress,
    provider: "provider-a",
    wrapperSymbol: "NVDAx",
    underlyingIdentity: "BINANCE_RWA:56:NVDA",
    underlyingTicker: "NVDA",
    underlyingName: "NVIDIA Corp",
    decimals: 6,
    tokenShareRatio: "0.5",
    tokenPriceUsd: "10",
    referencePriceUsd: "20",
    marketSession: {
      tradingAvailable: true,
      status: "open",
      reasonCode: null,
      reasonMessage: null,
    },
    actionGuard: { status: "CLEAR", reason: null },
    integrity: {
      status: "PASS",
      dataCompleteness: "COMPLETE",
      missingFields: [],
    },
    evidence: {
      identity: available("UNIVERSE"),
      decimals: available("UNIVERSE"),
      ratio: available("PROFILE"),
      tokenPrice: available("PRICE"),
      referencePrice: available("PRICE"),
      marketSession: available("MARKET"),
      actionGuard: available("MARKET"),
      integrity: available("PROFILE"),
      sources: { universe: available("UNIVERSE") },
    },
  };
  return {
    ...base,
    ...overrides,
    evidence: overrides.evidence ?? base.evidence,
  };
}

function balance(
  contractAddress: string,
  baseUnits: string,
  overrides: Partial<PortfolioBalanceInput> = {},
): PortfolioBalanceInput {
  return {
    chainId: "56",
    contractAddress,
    status: "OK",
    blockTag: "0xabc",
    rawBalanceHex: `0x${BigInt(baseUnits).toString(16)}`,
    balanceBaseUnits: baseUnits,
    error: null,
    ...overrides,
  };
}

describe("unified portfolio engine", () => {
  it("derives an exact positive wrapper quantity, share equivalence, and value", () => {
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [balance(CONTRACT_A, "1500000")],
      assets: [asset(CONTRACT_A)],
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.positions[0]).toMatchObject({
      balance: { quantity: "1.5", rawBaseUnits: "1500000" },
      equivalence: { underlyingEquivalentShares: "0.75" },
      valuation: {
        indicativeValueUsd: "15",
        referenceValueUsd: "15",
      },
    });
    expect(result.summary.indicativeValueUsd).toBe("15");
  });

  it("aggregates only explicit identical underlying identities across wrappers", () => {
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [
        balance(CONTRACT_A, "1000000"),
        balance(CONTRACT_B, "2000000"),
        balance(CONTRACT_C, "3000000"),
      ],
      assets: [
        asset(CONTRACT_A, { tokenShareRatio: "1", tokenPriceUsd: "10" }),
        asset(CONTRACT_B, {
          wrapperSymbol: "NVDAb",
          provider: "provider-b",
          tokenShareRatio: "0.5",
          tokenPriceUsd: "5",
        }),
        asset(CONTRACT_C, {
          wrapperSymbol: "AMDx",
          underlyingIdentity: "BINANCE_RWA:56:AMD",
          underlyingTicker: "AMD",
          underlyingName: "Advanced Micro Devices",
          tokenShareRatio: "1",
          tokenPriceUsd: "7",
        }),
      ],
    });

    expect(result.underlyingExposures).toHaveLength(2);
    expect(
      result.underlyingExposures.find((item) => item.ticker === "NVDA"),
    ).toMatchObject({
      positionCount: 2,
      underlyingEquivalentShares: "2",
      indicativeValueUsd: "20",
    });
    expect(
      result.underlyingExposures.find((item) => item.ticker === "AMD"),
    ).toMatchObject({ positionCount: 1, underlyingEquivalentShares: "3" });
  });

  it("keeps a proven zero distinct from an RPC failure", () => {
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [
        balance(CONTRACT_A, "0"),
        balance(CONTRACT_B, "0", {
          status: "ERROR",
          rawBalanceHex: null,
          balanceBaseUnits: null,
          error: "RPC unavailable",
        }),
      ],
      assets: [],
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.positions).toEqual([]);
    expect(result.balanceChecks).toEqual([
      expect.objectContaining({ contractAddress: CONTRACT_A, status: "ZERO" }),
      expect.objectContaining({
        contractAddress: CONTRACT_B,
        status: "RPC_ERROR",
        error: "RPC unavailable",
      }),
    ]);
    expect(result.summary).toMatchObject({
      provenZeroBalanceCount: 1,
      failedBalanceCount: 1,
    });
  });

  it("preserves unavailable decimals, ratio, token price, and reference price", () => {
    const base = asset(CONTRACT_A);
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [balance(CONTRACT_A, "1")],
      assets: [
        asset(CONTRACT_A, {
          decimals: null,
          tokenShareRatio: null,
          tokenPriceUsd: null,
          referencePriceUsd: null,
          integrity: {
            status: "UNKNOWN",
            dataCompleteness: "PARTIAL",
            missingFields: ["decimals", "ratio", "price", "reference"],
          },
          evidence: {
            ...base.evidence,
            decimals: missing("UNIVERSE", "TOKEN_DECIMALS_UNAVAILABLE"),
            ratio: missing("PROFILE", "TOKEN_SHARE_RATIO_UNAVAILABLE"),
            tokenPrice: missing("PRICE", "TOKEN_PRICE_UNAVAILABLE"),
            referencePrice: missing("PRICE", "REFERENCE_PRICE_UNAVAILABLE"),
          },
        }),
      ],
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.positions[0]).toMatchObject({
      balance: { quantity: null, quantityStatus: "UNAVAILABLE" },
      equivalence: {
        tokenShareRatio: null,
        underlyingEquivalentShares: null,
        status: "UNAVAILABLE",
      },
      valuation: {
        tokenPriceUsd: null,
        referencePriceUsd: null,
        indicativeValueUsd: null,
        referenceValueUsd: null,
        status: "UNAVAILABLE",
      },
    });
  });

  it("rejects metadata that mismatches the balance contract or chain", () => {
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [balance(CONTRACT_A, "1"), balance(CONTRACT_B, "1")],
      assets: [
        asset(CONTRACT_C),
        asset(CONTRACT_B, { chainId: "1" }),
      ],
    });

    expect(result.positions).toEqual([]);
    expect(result.balanceChecks.map((check) => check.status)).toEqual([
      "METADATA_UNAVAILABLE",
      "METADATA_UNAVAILABLE",
    ]);
    expect(result.summary.metadataFailureCount).toBe(2);
  });

  it("retains exact precision for very small and very large balances", () => {
    const small = asset(CONTRACT_A, {
      decimals: 18,
      tokenShareRatio: "0.000000000000000001",
      tokenPriceUsd: "0.000000000000000001",
    });
    const large = asset(CONTRACT_B, {
      decimals: 0,
      tokenShareRatio: "123456789.987654321",
      tokenPriceUsd: "999999999.999999999",
    });
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [
        balance(CONTRACT_A, "1"),
        balance(CONTRACT_B, "123456789012345678901234567890"),
      ],
      assets: [small, large],
    });

    expect(result.positions[0].balance.quantity).toBe("0.000000000000000001");
    expect(result.positions[0].equivalence.underlyingEquivalentShares).toBe(
      "0.000000000000000000000000000000000001",
    );
    expect(result.positions[0].valuation.indicativeValueUsd).toBe(
      "0.000000000000000000000000000000000001",
    );
    expect(result.positions[1].balance.quantity).toBe(
      "123456789012345678901234567890",
    );
    expect(result.positions[1].equivalence.underlyingEquivalentShares).toBe(
      "15241578873647309999999999999984758421.12635269",
    );
  });

  it("marks source-claimed but malformed numeric evidence INVALID", () => {
    const malformed = asset(CONTRACT_A, {
      tokenShareRatio: "not-a-ratio",
      tokenPriceUsd: "NaN",
    });
    const result = buildUnifiedPortfolio({
      chainId: "56",
      balances: [balance(CONTRACT_A, "1000000")],
      assets: [malformed],
    });

    expect(result.positions[0].equivalence.status).toBe("INVALID");
    expect(result.positions[0].valuation.status).toBe("INVALID");
    expect(result.status).toBe("PARTIAL");
  });
});
