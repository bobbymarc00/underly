import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import type {
  PortfolioEvidenceRef,
  UnifiedPortfolioPosition,
  UnifiedPortfolioResult,
} from "@/lib/underly/portfolio";
import { buildPortfolioExposureIntelligence } from "@/lib/underly/portfolio-intelligence";

const PreciseDecimal = Decimal.clone({ precision: 300 });

const CONTRACT_A = "0x1111111111111111111111111111111111111111";
const CONTRACT_B = "0x2222222222222222222222222222222222222222";
const CONTRACT_C = "0x3333333333333333333333333333333333333333";

function available(source = "TEST"): PortfolioEvidenceRef {
  return { source, status: "AVAILABLE", reason: null };
}

function position(params: {
  contract: string;
  provider?: string;
  symbol?: string;
  identity?: string | null;
  ticker?: string | null;
  value?: string | null;
  shares?: string | null;
  valuationStatus?: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "INVALID";
  identityStatus?: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "INVALID";
}): UnifiedPortfolioPosition {
  const value = params.value === undefined ? "10" : params.value;
  const shares = params.shares === undefined ? "1" : params.shares;
  return {
    underlying: {
      identity:
        params.identity === undefined
          ? "BINANCE_RWA:56:NVDA"
          : params.identity,
      ticker: params.ticker === undefined ? "NVDA" : params.ticker,
      name: params.ticker === "AMD" ? "Advanced Micro Devices" : "NVIDIA Corp",
      evidence: {
        source: "UNIVERSE",
        status: params.identityStatus ?? "AVAILABLE",
        reason: null,
      },
    },
    wrapper: {
      provider: params.provider ?? "provider-a",
      symbol: params.symbol ?? "SAME",
      chainId: "56",
      contractAddress: params.contract,
    },
    balance: {
      status: "POSITIVE",
      rawBaseUnits: "1",
      rawHex: "0x1",
      decimals: 0,
      quantity: "1",
      quantityStatus: "AVAILABLE",
      blockTag: "0xabc",
      source: "EVM_JSON_RPC",
    },
    equivalence: {
      tokenShareRatio: shares === null ? null : shares,
      underlyingEquivalentShares: shares,
      status: shares === null ? "UNAVAILABLE" : "AVAILABLE",
      evidence: available("PROFILE"),
    },
    valuation: {
      tokenPriceUsd: value,
      referencePriceUsd: value,
      indicativeValueUsd: value,
      referenceValueUsd: value,
      status: params.valuationStatus ?? (value === null ? "UNAVAILABLE" : "AVAILABLE"),
      tokenPriceEvidence: available("PRICE"),
      referencePriceEvidence: available("PRICE"),
    },
    marketSession: null,
    actionGuard: null,
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
}

function portfolio(
  positions: UnifiedPortfolioPosition[],
  options: {
    status?: UnifiedPortfolioResult["status"];
    reportedKnownValue?: string;
  } = {},
): Pick<UnifiedPortfolioResult, "status" | "positions" | "summary"> {
  const known =
    options.reportedKnownValue ??
    positions.reduce((sum, item) => {
      if (
        item.valuation.status !== "AVAILABLE" ||
        item.valuation.indicativeValueUsd === null
      ) {
        return sum;
      }
      return sum.plus(item.valuation.indicativeValueUsd);
    }, new PreciseDecimal(0)).toFixed();
  return {
    status: options.status ?? "AVAILABLE",
    positions,
    summary: {
      checkedWrapperCount: positions.length,
      positiveBalanceCount: positions.length,
      provenZeroBalanceCount: 0,
      failedBalanceCount: 0,
      metadataFailureCount: 0,
      positionCount: positions.length,
      underlyingCount: new Set(
        positions.flatMap((item) =>
          item.underlying.identity ? [item.underlying.identity] : [],
        ),
      ).size,
      indicativeValueUsd: known,
      knownIndicativeValueUsd: known,
      valuationStatus: "AVAILABLE",
    },
  };
}

describe("portfolio exposure intelligence", () => {
  it("groups exact positions by underlying, wrapper, and source provider", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio([
        position({ contract: CONTRACT_A, provider: "provider-a", value: "10" }),
        position({ contract: CONTRACT_B, provider: "provider-b", value: "30" }),
        position({
          contract: CONTRACT_C,
          provider: "provider-a",
          symbol: "SAME",
          identity: "BINANCE_RWA:56:AMD",
          ticker: "AMD",
          value: "60",
          shares: "3",
        }),
      ]),
    );

    expect(result.denominator).toMatchObject({
      knownIndicativeValueUsd: "100",
      status: "AVAILABLE",
    });
    expect(result.byUnderlying).toHaveLength(2);
    expect(result.byUnderlying.find((group) => group.ticker === "NVDA")).toMatchObject({
      positionCount: 2,
      knownIndicativeValueUsd: "40",
      knownValueWeightPct: "40",
      underlyingEquivalentShares: "2",
    });
    expect(result.byWrapper).toHaveLength(3);
    expect(result.byWrapper.map((group) => group.identity)).toEqual([
      `56:${CONTRACT_A}`,
      `56:${CONTRACT_B}`,
      `56:${CONTRACT_C}`,
    ]);
    expect(result.byProvider.find((group) => group.provider === "provider-a")).toMatchObject({
      positionCount: 2,
      knownIndicativeValueUsd: "70",
      knownValueWeightPct: "70",
      underlyingIdentities: [
        "BINANCE_RWA:56:AMD",
        "BINANCE_RWA:56:NVDA",
      ],
    });
    expect(result.reconciliation.status).toBe("MATCH");
  });

  it("keeps missing valuation excluded and labels every weight as partial known-value coverage", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio(
        [
          position({ contract: CONTRACT_A, value: "25" }),
          position({
            contract: CONTRACT_B,
            provider: "provider-b",
            value: null,
          }),
        ],
        { status: "PARTIAL" },
      ),
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.coverage).toMatchObject({
      knownValuePositionCount: 1,
      unknownValuePositionCount: 1,
      valuationCoveragePct: "50",
      status: "PARTIAL",
    });
    expect(result.denominator.knownIndicativeValueUsd).toBe("25");
    expect(result.byUnderlying[0]).toMatchObject({
      knownValueWeightPct: "100",
      valuationStatus: "PARTIAL",
      coverage: { unknownValuePositionCount: 1 },
      evidence: {
        status: "PARTIAL",
        reason: "POSITIONS_WITHOUT_CURRENT_VALUATION_EXCLUDED",
      },
    });
  });

  it("returns a null weight when the known-value denominator is zero", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio([position({ contract: CONTRACT_A, value: "0" })]),
    );

    expect(result.denominator).toMatchObject({
      knownIndicativeValueUsd: "0",
      status: "UNAVAILABLE",
    });
    expect(result.coverage.status).toBe("COMPLETE");
    expect(result.byUnderlying[0].knownValueWeightPct).toBeNull();
    expect(result.byWrapper[0].knownValueWeightPct).toBeNull();
    expect(result.byProvider[0].knownValueWeightPct).toBeNull();
  });

  it("keeps missing ratio separate from otherwise available value coverage", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio([
        position({ contract: CONTRACT_A, value: "10", shares: "1" }),
        position({ contract: CONTRACT_B, value: "20", shares: null }),
      ]),
    );

    expect(result.coverage.status).toBe("COMPLETE");
    expect(result.byUnderlying[0]).toMatchObject({
      underlyingEquivalentShares: null,
      knownUnderlyingEquivalentShares: "1",
      unknownSharePositionCount: 1,
      equivalenceStatus: "PARTIAL",
    });
  });

  it("excludes unknown identity only from underlying aggregation", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio([
        position({
          contract: CONTRACT_A,
          identity: null,
          ticker: null,
          identityStatus: "UNAVAILABLE",
          value: "10",
        }),
      ]),
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.coverage.unknownIdentityPositionCount).toBe(1);
    expect(result.byUnderlying).toEqual([]);
    expect(result.byWrapper).toHaveLength(1);
    expect(result.byProvider).toHaveLength(1);
  });

  it("inherits RPC or portfolio partial evidence without converting it to availability", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio([position({ contract: CONTRACT_A, value: "10" })], {
        status: "PARTIAL",
      }),
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.byWrapper[0].evidence).toMatchObject({
      status: "PARTIAL",
      reason: "PORTFOLIO_EVIDENCE_PARTIAL",
    });
  });

  it("deduplicates exact chain-contract identity and remains order deterministic", () => {
    const first = position({ contract: CONTRACT_A, value: "10" });
    const duplicate = structuredClone(first);
    const other = position({ contract: CONTRACT_B, value: "20" });
    const left = buildPortfolioExposureIntelligence(
      portfolio([first, duplicate, other], { reportedKnownValue: "30" }),
    );
    const right = buildPortfolioExposureIntelligence(
      portfolio([other, duplicate, first], { reportedKnownValue: "30" }),
    );

    expect(left).toEqual(right);
    expect(left.coverage).toMatchObject({
      inputPositionCount: 3,
      uniquePositionCount: 2,
      duplicatePositionCount: 1,
    });
    expect(left.denominator.knownIndicativeValueUsd).toBe("30");
    expect(left.byWrapper).toHaveLength(2);
    expect(left.status).toBe("PARTIAL");
  });

  it("fails conflicting duplicate contract evidence closed", () => {
    const result = buildPortfolioExposureIntelligence(
      portfolio(
        [
          position({
            contract: CONTRACT_A,
            provider: "provider-a",
            value: "10",
          }),
          position({
            contract: CONTRACT_A.toUpperCase(),
            provider: "provider-b",
            identity: "BINANCE_RWA:56:AMD",
            ticker: "AMD",
            value: "999",
          }),
        ],
        { reportedKnownValue: "1009" },
      ),
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.denominator).toMatchObject({
      knownIndicativeValueUsd: "0",
      status: "UNAVAILABLE",
    });
    expect(result.coverage).toMatchObject({
      inputPositionCount: 2,
      uniquePositionCount: 1,
      duplicatePositionCount: 1,
      unknownIdentityPositionCount: 1,
      unknownValuePositionCount: 1,
    });
    expect(result.byUnderlying).toEqual([]);
    expect(result.byWrapper[0]).toMatchObject({
      identity: `56:${CONTRACT_A}`,
      provider: "unknown",
      knownIndicativeValueUsd: "0",
      knownValueWeightPct: null,
      valuationStatus: "UNAVAILABLE",
    });
    expect(result.byProvider[0].provider).toBe("unknown");
    expect(result.reconciliation.status).toBe("MISMATCH");
  });

  it("preserves exact decimal precision and reconciles every breakdown", () => {
    const tiny = "0.000000000000000000000000000000000001";
    const large = "123456789012345678901234567890.123456789";
    const total = new PreciseDecimal(tiny).plus(large).toFixed();
    const result = buildPortfolioExposureIntelligence(
      portfolio(
        [
          position({ contract: CONTRACT_A, provider: "p1", value: tiny }),
          position({ contract: CONTRACT_B, provider: "p2", value: large }),
        ],
        { reportedKnownValue: total },
      ),
    );

    expect(result.denominator.knownIndicativeValueUsd).toBe(total);
    expect(
      result.byWrapper.reduce(
        (sum, group) => sum.plus(group.knownIndicativeValueUsd),
        new PreciseDecimal(0),
      ).toFixed(),
    ).toBe(total);
    expect(
      result.byProvider.reduce(
        (sum, group) => sum.plus(group.knownIndicativeValueUsd),
        new PreciseDecimal(0),
      ).toFixed(),
    ).toBe(total);
    expect(result.reconciliation.status).toBe("MATCH");
  });
});
