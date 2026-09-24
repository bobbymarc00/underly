import Decimal from "decimal.js";

import type {
  UnifiedPortfolioPosition,
  UnifiedPortfolioResult,
} from "./portfolio";

const PreciseDecimal = Decimal.clone({
  precision: 300,
  rounding: Decimal.ROUND_HALF_UP,
});

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type PortfolioExposureStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

export type ExposureValuationStatus =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

export interface PortfolioExposureDenominator {
  basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD";
  knownIndicativeValueUsd: string;
  knownValuePositionCount: number;
  unknownValuePositionCount: number;
  status: "AVAILABLE" | "UNAVAILABLE";
}

export interface ExposureCoverage {
  totalPositionCount: number;
  knownValuePositionCount: number;
  unknownValuePositionCount: number;
  valuationCoveragePct: string | null;
  status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
}

export interface ExposurePositionRef {
  positionKey: string;
  chainId: string;
  contractAddress: string;
  provider: string;
  symbol: string;
  underlyingIdentity: string | null;
  underlyingTicker: string | null;
}

interface ExposureGroupBase {
  positionCount: number;
  positions: ExposurePositionRef[];
  knownIndicativeValueUsd: string;
  knownValueWeightPct: string | null;
  weightDenominator: PortfolioExposureDenominator;
  valuationStatus: ExposureValuationStatus;
  coverage: ExposureCoverage;
  evidence: {
    source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT";
    status: PortfolioExposureStatus;
    reason: string | null;
  };
}

export interface UnderlyingExposureBreakdown extends ExposureGroupBase {
  identity: string;
  ticker: string;
  name: string | null;
  underlyingEquivalentShares: string | null;
  knownUnderlyingEquivalentShares: string;
  unknownSharePositionCount: number;
  equivalenceStatus: ExposureValuationStatus;
}

export interface WrapperExposureBreakdown extends ExposureGroupBase {
  identity: string;
  chainId: string;
  contractAddress: string;
  provider: string;
  symbol: string;
  underlyingIdentity: string | null;
  underlyingTicker: string | null;
}

export interface ProviderExposureBreakdown extends ExposureGroupBase {
  identity: string;
  provider: string;
  wrapperContracts: string[];
  underlyingIdentities: string[];
}

export interface PortfolioExposureIntelligence {
  status: PortfolioExposureStatus;
  denominator: PortfolioExposureDenominator;
  coverage: {
    inputPositionCount: number;
    uniquePositionCount: number;
    duplicatePositionCount: number;
    unknownIdentityPositionCount: number;
    knownValuePositionCount: number;
    unknownValuePositionCount: number;
    valuationCoveragePct: string | null;
    status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  };
  reconciliation: {
    exposureKnownIndicativeValueUsd: string;
    portfolioKnownIndicativeValueUsd: string;
    status: "MATCH" | "MISMATCH" | "UNAVAILABLE";
  };
  byUnderlying: UnderlyingExposureBreakdown[];
  byWrapper: WrapperExposureBreakdown[];
  byProvider: ProviderExposureBreakdown[];
}

function transport(value: Decimal): string {
  return value.toFixed();
}

function ratioPct(numerator: number, denominator: number): string | null {
  if (denominator <= 0) return null;
  return transport(
    new PreciseDecimal(numerator).div(denominator).mul(100),
  );
}

function nonNegativeDecimal(value: string | null): Decimal | null {
  if (value === null) return null;
  try {
    const parsed = new PreciseDecimal(value);
    return parsed.isFinite() && parsed.gte(0) ? parsed : null;
  } catch {
    return null;
  }
}

function positionKey(position: UnifiedPortfolioPosition): string | null {
  const contract = position.wrapper.contractAddress.trim().toLowerCase();
  const chainId = position.wrapper.chainId.trim();
  if (!chainId || !EVM_ADDRESS.test(contract)) return null;
  return `${chainId}:${contract}`;
}

function positionRef(
  position: UnifiedPortfolioPosition,
  key: string,
): ExposurePositionRef {
  return {
    positionKey: key,
    chainId: position.wrapper.chainId,
    contractAddress: position.wrapper.contractAddress.toLowerCase(),
    provider: position.wrapper.provider,
    symbol: position.wrapper.symbol,
    underlyingIdentity: position.underlying.identity,
    underlyingTicker: position.underlying.ticker,
  };
}

function stablePositionSignature(position: UnifiedPortfolioPosition): string {
  return JSON.stringify({
    underlying: position.underlying,
    wrapper: {
      ...position.wrapper,
      contractAddress: position.wrapper.contractAddress.toLowerCase(),
    },
    balance: position.balance,
    equivalence: position.equivalence,
    valuation: position.valuation,
  });
}

function conflictedDuplicatePosition(
  position: UnifiedPortfolioPosition,
): UnifiedPortfolioPosition {
  return {
    ...position,
    underlying: {
      identity: null,
      ticker: null,
      name: null,
      evidence: {
        source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT",
        status: "INVALID",
        reason: "CONFLICTING_DUPLICATE_WRAPPER_IDENTITY",
      },
    },
    wrapper: {
      ...position.wrapper,
      provider: "unknown",
      contractAddress: position.wrapper.contractAddress.toLowerCase(),
    },
    equivalence: {
      ...position.equivalence,
      tokenShareRatio: null,
      underlyingEquivalentShares: null,
      status: "INVALID",
      evidence: {
        source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT",
        status: "INVALID",
        reason: "CONFLICTING_DUPLICATE_WRAPPER_IDENTITY",
      },
    },
    valuation: {
      ...position.valuation,
      tokenPriceUsd: null,
      referencePriceUsd: null,
      indicativeValueUsd: null,
      referenceValueUsd: null,
      status: "INVALID",
      tokenPriceEvidence: {
        source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT",
        status: "INVALID",
        reason: "CONFLICTING_DUPLICATE_WRAPPER_IDENTITY",
      },
      referencePriceEvidence: {
        source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT",
        status: "INVALID",
        reason: "CONFLICTING_DUPLICATE_WRAPPER_IDENTITY",
      },
    },
  };
}

function uniquePositions(positions: UnifiedPortfolioPosition[]): {
  positions: Array<{ key: string; position: UnifiedPortfolioPosition }>;
  duplicatePositionCount: number;
} {
  const grouped = new Map<string, UnifiedPortfolioPosition[]>();
  let invalid = 0;

  for (const position of positions) {
    const key = positionKey(position);
    if (!key) {
      invalid += 1;
      continue;
    }
    const group = grouped.get(key) ?? [];
    group.push(position);
    grouped.set(key, group);
  }

  const unique = Array.from(grouped.entries()).map(([key, group]) => {
    const sorted = [...group].sort((left, right) =>
      stablePositionSignature(left).localeCompare(stablePositionSignature(right)),
    );
    const signatures = new Set(sorted.map(stablePositionSignature));
    return {
      key,
      position:
        signatures.size > 1
          ? conflictedDuplicatePosition(sorted[0])
          : sorted[0],
    };
  });

  return {
    positions: unique.sort((left, right) => left.key.localeCompare(right.key)),
    duplicatePositionCount:
      invalid + positions.length - invalid - unique.length,
  };
}

function knownValue(position: UnifiedPortfolioPosition): Decimal | null {
  if (position.valuation.status !== "AVAILABLE") return null;
  return nonNegativeDecimal(position.valuation.indicativeValueUsd);
}

function coverage(
  positions: Array<{ position: UnifiedPortfolioPosition }>,
): ExposureCoverage {
  const knownValuePositionCount = positions.filter(
    ({ position }) => knownValue(position) !== null,
  ).length;
  const totalPositionCount = positions.length;
  const unknownValuePositionCount =
    totalPositionCount - knownValuePositionCount;

  return {
    totalPositionCount,
    knownValuePositionCount,
    unknownValuePositionCount,
    valuationCoveragePct: ratioPct(
      knownValuePositionCount,
      totalPositionCount,
    ),
    status:
      totalPositionCount === 0 || knownValuePositionCount === 0
        ? "UNAVAILABLE"
        : unknownValuePositionCount === 0
          ? "COMPLETE"
          : "PARTIAL",
  };
}

function knownValueSum(
  positions: Array<{ position: UnifiedPortfolioPosition }>,
): Decimal {
  return positions.reduce((sum, { position }) => {
    const value = knownValue(position);
    return value === null ? sum : sum.plus(value);
  }, new PreciseDecimal(0));
}

function valuationStatus(value: ExposureCoverage): ExposureValuationStatus {
  if (value.status === "COMPLETE") return "AVAILABLE";
  if (value.status === "PARTIAL") return "PARTIAL";
  return "UNAVAILABLE";
}

function groupBase(params: {
  positions: Array<{ key: string; position: UnifiedPortfolioPosition }>;
  denominator: PortfolioExposureDenominator;
  inheritedPartial?: boolean;
}): ExposureGroupBase {
  const groupCoverage = coverage(params.positions);
  const value = knownValueSum(params.positions);
  const denominator = nonNegativeDecimal(
    params.denominator.knownIndicativeValueUsd,
  );
  const weight =
    params.denominator.status === "AVAILABLE" &&
    denominator &&
    denominator.gt(0) &&
    groupCoverage.knownValuePositionCount > 0
      ? transport(value.div(denominator).mul(100))
      : null;
  const status: PortfolioExposureStatus =
    groupCoverage.status === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : groupCoverage.status === "PARTIAL" || params.inheritedPartial
        ? "PARTIAL"
        : "AVAILABLE";

  return {
    positionCount: params.positions.length,
    positions: params.positions
      .map(({ key, position }) => positionRef(position, key))
      .sort((left, right) => left.positionKey.localeCompare(right.positionKey)),
    knownIndicativeValueUsd: transport(value),
    knownValueWeightPct: weight,
    weightDenominator: params.denominator,
    valuationStatus: valuationStatus(groupCoverage),
    coverage: groupCoverage,
    evidence: {
      source: "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT",
      status,
      reason:
        groupCoverage.unknownValuePositionCount > 0
          ? "POSITIONS_WITHOUT_CURRENT_VALUATION_EXCLUDED"
          : params.inheritedPartial
            ? "PORTFOLIO_EVIDENCE_PARTIAL"
            : null,
    },
  };
}

function groupBy<K extends string>(
  positions: Array<{ key: string; position: UnifiedPortfolioPosition }>,
  select: (position: UnifiedPortfolioPosition) => K | null,
): Map<K, Array<{ key: string; position: UnifiedPortfolioPosition }>> {
  const grouped = new Map<
    K,
    Array<{ key: string; position: UnifiedPortfolioPosition }>
  >();
  for (const item of positions) {
    const key = select(item.position);
    if (key === null) continue;
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}

export function emptyPortfolioExposureIntelligence(
  status: PortfolioExposureStatus = "UNAVAILABLE",
): PortfolioExposureIntelligence {
  const denominator: PortfolioExposureDenominator = {
    basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
    knownIndicativeValueUsd: "0",
    knownValuePositionCount: 0,
    unknownValuePositionCount: 0,
    status: "UNAVAILABLE",
  };
  return {
    status,
    denominator,
    coverage: {
      inputPositionCount: 0,
      uniquePositionCount: 0,
      duplicatePositionCount: 0,
      unknownIdentityPositionCount: 0,
      knownValuePositionCount: 0,
      unknownValuePositionCount: 0,
      valuationCoveragePct: null,
      status: "UNAVAILABLE",
    },
    reconciliation: {
      exposureKnownIndicativeValueUsd: "0",
      portfolioKnownIndicativeValueUsd: "0",
      status: "UNAVAILABLE",
    },
    byUnderlying: [],
    byWrapper: [],
    byProvider: [],
  };
}

export function buildPortfolioExposureIntelligence(
  portfolio: Pick<UnifiedPortfolioResult, "status" | "positions" | "summary">,
): PortfolioExposureIntelligence {
  const deduplicated = uniquePositions(portfolio.positions);
  const portfolioCoverage = coverage(deduplicated.positions);
  const totalKnownValue = knownValueSum(deduplicated.positions);
  const denominator: PortfolioExposureDenominator = {
    basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
    knownIndicativeValueUsd: transport(totalKnownValue),
    knownValuePositionCount: portfolioCoverage.knownValuePositionCount,
    unknownValuePositionCount: portfolioCoverage.unknownValuePositionCount,
    status: totalKnownValue.gt(0) ? "AVAILABLE" : "UNAVAILABLE",
  };
  const unknownIdentityPositionCount = deduplicated.positions.filter(
    ({ position }) =>
      !position.underlying.identity ||
      !position.underlying.ticker ||
      position.underlying.evidence.status !== "AVAILABLE",
  ).length;
  const reportedKnownValue = nonNegativeDecimal(
    portfolio.summary.knownIndicativeValueUsd,
  );
  const reconciliationStatus =
    reportedKnownValue === null
      ? "UNAVAILABLE"
      : reportedKnownValue.eq(totalKnownValue)
        ? "MATCH"
        : "MISMATCH";
  const inheritedPartial =
    portfolio.status !== "AVAILABLE" ||
    deduplicated.duplicatePositionCount > 0 ||
    reconciliationStatus === "MISMATCH";

  const byUnderlying = Array.from(
    groupBy(deduplicated.positions, (position) =>
      position.underlying.identity &&
      position.underlying.ticker &&
      position.underlying.evidence.status === "AVAILABLE"
        ? position.underlying.identity
        : null,
    ).entries(),
  )
    .map(([identity, positions]): UnderlyingExposureBreakdown => {
      const knownShares = positions.reduce((sum, { position }) => {
        const shares = nonNegativeDecimal(
          position.equivalence.underlyingEquivalentShares,
        );
        return shares === null ? sum : sum.plus(shares);
      }, new PreciseDecimal(0));
      const unknownSharePositionCount = positions.filter(
        ({ position }) =>
          nonNegativeDecimal(
            position.equivalence.underlyingEquivalentShares,
          ) === null,
      ).length;
      const base = groupBase({
        positions,
        denominator,
        inheritedPartial,
      });
      const sharesAvailable = positions.length - unknownSharePositionCount;

      return {
        ...base,
        identity,
        ticker: positions[0].position.underlying.ticker as string,
        name: positions[0].position.underlying.name,
        underlyingEquivalentShares:
          unknownSharePositionCount === 0 ? transport(knownShares) : null,
        knownUnderlyingEquivalentShares: transport(knownShares),
        unknownSharePositionCount,
        equivalenceStatus:
          sharesAvailable === 0
            ? "UNAVAILABLE"
            : unknownSharePositionCount === 0
              ? "AVAILABLE"
              : "PARTIAL",
      };
    })
    .sort((left, right) => left.identity.localeCompare(right.identity));

  const byWrapper = deduplicated.positions
    .map(({ key, position }): WrapperExposureBreakdown => ({
      ...groupBase({
        positions: [{ key, position }],
        denominator,
        inheritedPartial,
      }),
      identity: key,
      chainId: position.wrapper.chainId,
      contractAddress: position.wrapper.contractAddress.toLowerCase(),
      provider: position.wrapper.provider,
      symbol: position.wrapper.symbol,
      underlyingIdentity: position.underlying.identity,
      underlyingTicker: position.underlying.ticker,
    }))
    .sort((left, right) => left.identity.localeCompare(right.identity));

  const byProvider = Array.from(
    groupBy(deduplicated.positions, (position) =>
      position.wrapper.provider.trim() || "unknown",
    ).entries(),
  )
    .map(([provider, positions]): ProviderExposureBreakdown => ({
      ...groupBase({ positions, denominator, inheritedPartial }),
      identity: provider,
      provider,
      wrapperContracts: positions
        .map(({ position }) => position.wrapper.contractAddress.toLowerCase())
        .sort(),
      underlyingIdentities: Array.from(
        new Set(
          positions.flatMap(({ position }) =>
            position.underlying.identity ? [position.underlying.identity] : [],
          ),
        ),
      ).sort(),
    }))
    .sort((left, right) => left.identity.localeCompare(right.identity));

  const status: PortfolioExposureStatus =
    portfolio.status === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : inheritedPartial ||
          portfolioCoverage.status === "PARTIAL" ||
          unknownIdentityPositionCount > 0
        ? "PARTIAL"
        : portfolio.status;

  return {
    status,
    denominator,
    coverage: {
      inputPositionCount: portfolio.positions.length,
      uniquePositionCount: deduplicated.positions.length,
      duplicatePositionCount: deduplicated.duplicatePositionCount,
      unknownIdentityPositionCount,
      knownValuePositionCount: portfolioCoverage.knownValuePositionCount,
      unknownValuePositionCount: portfolioCoverage.unknownValuePositionCount,
      valuationCoveragePct: portfolioCoverage.valuationCoveragePct,
      status: portfolioCoverage.status,
    },
    reconciliation: {
      exposureKnownIndicativeValueUsd: transport(totalKnownValue),
      portfolioKnownIndicativeValueUsd:
        portfolio.summary.knownIndicativeValueUsd,
      status: reconciliationStatus,
    },
    byUnderlying,
    byWrapper,
    byProvider,
  };
}
