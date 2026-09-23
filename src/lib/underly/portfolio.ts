import Decimal from "decimal.js";

const PreciseDecimal = Decimal.clone({
  precision: 300,
  rounding: Decimal.ROUND_HALF_UP,
});

const UINT = /^[0-9]+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type PortfolioEvidenceStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR"
  | "INVALID";

export interface PortfolioEvidenceRef {
  source: string;
  status: PortfolioEvidenceStatus;
  reason: string | null;
}

export interface PortfolioBalanceInput {
  chainId: string;
  contractAddress: string;
  status: "OK" | "ERROR";
  blockTag: string;
  rawBalanceHex: string | null;
  balanceBaseUnits: string | null;
  error: string | null;
}

export interface PortfolioAssetMetadata {
  chainId: string;
  contractAddress: string;
  provider: string;
  wrapperSymbol: string;
  underlyingIdentity: string | null;
  underlyingTicker: string | null;
  underlyingName: string | null;
  decimals: number | null;
  tokenShareRatio: string | null;
  tokenPriceUsd: string | null;
  referencePriceUsd: string | null;
  marketSession: {
    tradingAvailable: boolean | null;
    status: string | null;
    reasonCode: string | null;
    reasonMessage: string | null;
  } | null;
  actionGuard: {
    status: "CLEAR" | "ACTIVE" | "UNKNOWN";
    reason: string | null;
  } | null;
  integrity: {
    status: "PASS" | "WARN" | "BLOCKED" | "UNKNOWN" | "NOT_APPLICABLE";
    dataCompleteness: "COMPLETE" | "PARTIAL";
    missingFields: string[];
  };
  evidence: {
    identity: PortfolioEvidenceRef;
    decimals: PortfolioEvidenceRef;
    ratio: PortfolioEvidenceRef;
    tokenPrice: PortfolioEvidenceRef;
    referencePrice: PortfolioEvidenceRef;
    marketSession: PortfolioEvidenceRef;
    actionGuard: PortfolioEvidenceRef;
    integrity: PortfolioEvidenceRef;
    sources: Record<string, PortfolioEvidenceRef>;
  };
}

export interface UnifiedPortfolioPosition {
  underlying: {
    identity: string | null;
    ticker: string | null;
    name: string | null;
    evidence: PortfolioEvidenceRef;
  };
  wrapper: {
    provider: string;
    symbol: string;
    chainId: string;
    contractAddress: string;
  };
  balance: {
    status: "POSITIVE";
    rawBaseUnits: string;
    rawHex: string | null;
    decimals: number | null;
    quantity: string | null;
    quantityStatus: PortfolioEvidenceStatus;
    blockTag: string;
    source: "EVM_JSON_RPC";
  };
  equivalence: {
    tokenShareRatio: string | null;
    underlyingEquivalentShares: string | null;
    status: PortfolioEvidenceStatus;
    evidence: PortfolioEvidenceRef;
  };
  valuation: {
    tokenPriceUsd: string | null;
    referencePriceUsd: string | null;
    indicativeValueUsd: string | null;
    referenceValueUsd: string | null;
    status: PortfolioEvidenceStatus;
    tokenPriceEvidence: PortfolioEvidenceRef;
    referencePriceEvidence: PortfolioEvidenceRef;
  };
  marketSession: PortfolioAssetMetadata["marketSession"];
  actionGuard: PortfolioAssetMetadata["actionGuard"];
  integrity: PortfolioAssetMetadata["integrity"];
  evidence: PortfolioAssetMetadata["evidence"];
}

export interface UnifiedPortfolioResult {
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  positions: UnifiedPortfolioPosition[];
  underlyingExposures: Array<{
    identity: string;
    ticker: string;
    name: string | null;
    positionCount: number;
    wrapperContracts: string[];
    underlyingEquivalentShares: string | null;
    knownUnderlyingEquivalentShares: string;
    indicativeValueUsd: string | null;
    knownIndicativeValueUsd: string;
    status: "AVAILABLE" | "PARTIAL";
  }>;
  balanceChecks: Array<{
    chainId: string;
    contractAddress: string;
    blockTag: string;
    status:
      | "POSITIVE"
      | "ZERO"
      | "RPC_ERROR"
      | "BALANCE_INVALID"
      | "METADATA_UNAVAILABLE";
    balanceBaseUnits: string | null;
    error: string | null;
  }>;
  summary: {
    checkedWrapperCount: number;
    positiveBalanceCount: number;
    provenZeroBalanceCount: number;
    failedBalanceCount: number;
    metadataFailureCount: number;
    positionCount: number;
    underlyingCount: number;
    indicativeValueUsd: string | null;
    knownIndicativeValueUsd: string;
    valuationStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  };
}

function normalizeContract(value: string): string | null {
  return EVM_ADDRESS.test(value) ? value.toLowerCase() : null;
}

function positiveDecimal(value: string | null): Decimal | null {
  if (!value) return null;
  try {
    const parsed = new PreciseDecimal(value);
    return parsed.isFinite() && parsed.gt(0) ? parsed : null;
  } catch {
    return null;
  }
}

function exactQuantity(raw: string, decimals: number): string {
  const digits = BigInt(raw).toString(10);
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function decimal(value: string): Decimal {
  return new PreciseDecimal(value);
}

function transport(value: Decimal): string {
  return value.toFixed();
}

function aggregatePositions(positions: UnifiedPortfolioPosition[]) {
  const grouped = new Map<string, UnifiedPortfolioPosition[]>();
  for (const position of positions) {
    const identity = position.underlying.identity;
    if (
      !identity ||
      !position.underlying.ticker ||
      position.underlying.evidence.status !== "AVAILABLE"
    ) {
      continue;
    }
    const current = grouped.get(identity) ?? [];
    current.push(position);
    grouped.set(identity, current);
  }

  return Array.from(grouped.entries())
    .map(([identity, group]) => {
      const knownShares = group
        .map((position) => position.equivalence.underlyingEquivalentShares)
        .filter((value): value is string => value !== null)
        .reduce((sum, value) => sum.plus(value), new PreciseDecimal(0));
      const knownValues = group
        .map((position) => position.valuation.indicativeValueUsd)
        .filter((value): value is string => value !== null)
        .reduce((sum, value) => sum.plus(value), new PreciseDecimal(0));
      const completeShares = group.every(
        (position) => position.equivalence.underlyingEquivalentShares !== null,
      );
      const completeValues = group.every(
        (position) => position.valuation.indicativeValueUsd !== null,
      );

      return {
        identity,
        ticker: group[0].underlying.ticker as string,
        name: group[0].underlying.name,
        positionCount: group.length,
        wrapperContracts: group
          .map((position) => position.wrapper.contractAddress)
          .sort(),
        underlyingEquivalentShares: completeShares
          ? transport(knownShares)
          : null,
        knownUnderlyingEquivalentShares: transport(knownShares),
        indicativeValueUsd: completeValues ? transport(knownValues) : null,
        knownIndicativeValueUsd: transport(knownValues),
        status:
          completeShares && completeValues
            ? ("AVAILABLE" as const)
            : ("PARTIAL" as const),
      };
    })
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

export function buildUnifiedPortfolio(params: {
  chainId: string;
  balances: PortfolioBalanceInput[];
  assets: PortfolioAssetMetadata[];
}): UnifiedPortfolioResult {
  const assetByKey = new Map<string, PortfolioAssetMetadata>();
  for (const asset of params.assets) {
    const contract = normalizeContract(asset.contractAddress);
    if (!contract || asset.chainId !== params.chainId) continue;
    assetByKey.set(`${asset.chainId}:${contract}`, asset);
  }

  const positions: UnifiedPortfolioPosition[] = [];
  const balanceChecks: UnifiedPortfolioResult["balanceChecks"] = [];

  for (const balance of params.balances) {
    const contract = normalizeContract(balance.contractAddress);
    const baseCheck = {
      chainId: balance.chainId,
      contractAddress: contract ?? balance.contractAddress,
      blockTag: balance.blockTag,
    };

    if (balance.status === "ERROR") {
      balanceChecks.push({
        ...baseCheck,
        status: "RPC_ERROR",
        balanceBaseUnits: null,
        error: balance.error ?? "Wallet balance read failed",
      });
      continue;
    }
    if (
      balance.chainId !== params.chainId ||
      !contract ||
      !balance.balanceBaseUnits ||
      !UINT.test(balance.balanceBaseUnits)
    ) {
      balanceChecks.push({
        ...baseCheck,
        status: "BALANCE_INVALID",
        balanceBaseUnits: balance.balanceBaseUnits,
        error: "BALANCE_EVIDENCE_INVALID",
      });
      continue;
    }

    const raw = BigInt(balance.balanceBaseUnits);
    if (raw === 0n) {
      balanceChecks.push({
        ...baseCheck,
        status: "ZERO",
        balanceBaseUnits: "0",
        error: null,
      });
      continue;
    }

    const asset = assetByKey.get(`${params.chainId}:${contract}`);
    if (!asset) {
      balanceChecks.push({
        ...baseCheck,
        status: "METADATA_UNAVAILABLE",
        balanceBaseUnits: raw.toString(10),
        error: "VALIDATED_ASSET_METADATA_UNAVAILABLE",
      });
      continue;
    }

    const decimalsValid =
      asset.decimals !== null &&
      Number.isInteger(asset.decimals) &&
      asset.decimals >= 0 &&
      asset.decimals <= 255 &&
      asset.evidence.decimals.status === "AVAILABLE";
    const quantity = decimalsValid
      ? exactQuantity(raw.toString(10), asset.decimals!)
      : null;
    const ratio =
      asset.evidence.ratio.status === "AVAILABLE"
        ? positiveDecimal(asset.tokenShareRatio)
        : null;
    const tokenPrice =
      asset.evidence.tokenPrice.status === "AVAILABLE"
        ? positiveDecimal(asset.tokenPriceUsd)
        : null;
    const referencePrice =
      asset.evidence.referencePrice.status === "AVAILABLE"
        ? positiveDecimal(asset.referencePriceUsd)
        : null;
    const underlyingShares =
      quantity && ratio ? transport(decimal(quantity).mul(ratio)) : null;
    const indicativeValue =
      quantity && tokenPrice
        ? transport(decimal(quantity).mul(tokenPrice))
        : null;
    const referenceValue =
      underlyingShares && referencePrice
        ? transport(decimal(underlyingShares).mul(referencePrice))
        : null;
    const equivalenceStatus: PortfolioEvidenceStatus = underlyingShares
      ? "AVAILABLE"
      : asset.evidence.ratio.status === "AVAILABLE" && !ratio
        ? "INVALID"
        : asset.evidence.ratio.status;
    const valuationStatus: PortfolioEvidenceStatus = indicativeValue
      ? "AVAILABLE"
      : asset.evidence.tokenPrice.status === "AVAILABLE" && !tokenPrice
        ? "INVALID"
        : asset.evidence.tokenPrice.status;

    positions.push({
      underlying: {
        identity: asset.underlyingIdentity,
        ticker: asset.underlyingTicker,
        name: asset.underlyingName,
        evidence: asset.evidence.identity,
      },
      wrapper: {
        provider: asset.provider,
        symbol: asset.wrapperSymbol,
        chainId: asset.chainId,
        contractAddress: contract,
      },
      balance: {
        status: "POSITIVE",
        rawBaseUnits: raw.toString(10),
        rawHex: balance.rawBalanceHex,
        decimals: decimalsValid ? asset.decimals : null,
        quantity,
        quantityStatus: decimalsValid ? "AVAILABLE" : "UNAVAILABLE",
        blockTag: balance.blockTag,
        source: "EVM_JSON_RPC",
      },
      equivalence: {
        tokenShareRatio: ratio ? transport(ratio) : null,
        underlyingEquivalentShares: underlyingShares,
        status: equivalenceStatus,
        evidence: asset.evidence.ratio,
      },
      valuation: {
        tokenPriceUsd: tokenPrice ? transport(tokenPrice) : null,
        referencePriceUsd: referencePrice ? transport(referencePrice) : null,
        indicativeValueUsd: indicativeValue,
        referenceValueUsd: referenceValue,
        status: valuationStatus,
        tokenPriceEvidence: asset.evidence.tokenPrice,
        referencePriceEvidence: asset.evidence.referencePrice,
      },
      marketSession: asset.marketSession,
      actionGuard: asset.actionGuard,
      integrity: asset.integrity,
      evidence: asset.evidence,
    });
    balanceChecks.push({
      ...baseCheck,
      status: "POSITIVE",
      balanceBaseUnits: raw.toString(10),
      error: null,
    });
  }

  positions.sort(
    (a, b) =>
      (a.underlying.identity ?? "~").localeCompare(
        b.underlying.identity ?? "~",
      ) || a.wrapper.contractAddress.localeCompare(b.wrapper.contractAddress),
  );
  const underlyingExposures = aggregatePositions(positions);
  const knownValues = positions
    .map((position) => position.valuation.indicativeValueUsd)
    .filter((value): value is string => value !== null)
    .reduce((sum, value) => sum.plus(value), new PreciseDecimal(0));
  const valuesComplete = positions.every(
    (position) => position.valuation.indicativeValueUsd !== null,
  );
  const failedBalanceCount = balanceChecks.filter(
    (check) =>
      check.status === "RPC_ERROR" || check.status === "BALANCE_INVALID",
  ).length;
  const metadataFailureCount = balanceChecks.filter(
    (check) => check.status === "METADATA_UNAVAILABLE",
  ).length;
  const provenZeroBalanceCount = balanceChecks.filter(
    (check) => check.status === "ZERO",
  ).length;
  const positiveBalanceCount = balanceChecks.filter(
    (check) => check.status === "POSITIVE",
  ).length;
  const evidencePartial = positions.some(
    (position) =>
      position.balance.quantity === null ||
      position.equivalence.underlyingEquivalentShares === null ||
      position.valuation.indicativeValueUsd === null ||
      position.underlying.identity === null ||
      position.integrity.dataCompleteness === "PARTIAL" ||
      Object.values(position.evidence.sources).some(
        (source) => source.status !== "AVAILABLE",
      ),
  );
  const status: UnifiedPortfolioResult["status"] =
    params.balances.length > 0 && failedBalanceCount === params.balances.length
      ? "UNAVAILABLE"
      : failedBalanceCount > 0 || metadataFailureCount > 0 || evidencePartial
        ? "PARTIAL"
        : "AVAILABLE";
  const valuationStatus: UnifiedPortfolioResult["summary"]["valuationStatus"] =
    positions.length === 0
      ? failedBalanceCount || metadataFailureCount
        ? "UNAVAILABLE"
        : "AVAILABLE"
      : valuesComplete
        ? "AVAILABLE"
        : knownValues.gt(0)
          ? "PARTIAL"
          : "UNAVAILABLE";

  return {
    status,
    positions,
    underlyingExposures,
    balanceChecks,
    summary: {
      checkedWrapperCount: balanceChecks.length,
      positiveBalanceCount,
      provenZeroBalanceCount,
      failedBalanceCount,
      metadataFailureCount,
      positionCount: positions.length,
      underlyingCount: underlyingExposures.length,
      indicativeValueUsd:
        positions.length === 0 || valuesComplete ? transport(knownValues) : null,
      knownIndicativeValueUsd: transport(knownValues),
      valuationStatus,
    },
  };
}
