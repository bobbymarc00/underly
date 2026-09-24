import type { PortfolioPayload } from "@/lib/ui/market-types";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const POSITIVE_DECIMAL = /^\d+(?:\.\d+)?$/;
const NON_NEGATIVE_DECIMAL = /^\d+(?:\.\d+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function decimalOrNull(value: unknown): boolean {
  return value === null ||
    (typeof value === "string" && NON_NEGATIVE_DECIMAL.test(value));
}

function exposureDenominator(value: unknown): boolean {
  return (
    record(value) &&
    value.basis === "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD" &&
    typeof value.knownIndicativeValueUsd === "string" &&
    NON_NEGATIVE_DECIMAL.test(value.knownIndicativeValueUsd) &&
    count(value.knownValuePositionCount) &&
    count(value.unknownValuePositionCount) &&
    ["AVAILABLE", "UNAVAILABLE"].includes(String(value.status))
  );
}

function exposureCoverage(value: unknown): boolean {
  return (
    record(value) &&
    count(value.totalPositionCount) &&
    count(value.knownValuePositionCount) &&
    count(value.unknownValuePositionCount) &&
    decimalOrNull(value.valuationCoveragePct) &&
    ["COMPLETE", "PARTIAL", "UNAVAILABLE"].includes(String(value.status))
  );
}

function exposurePosition(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.positionKey === "string" &&
    typeof value.chainId === "string" &&
    typeof value.contractAddress === "string" &&
    EVM_ADDRESS.test(value.contractAddress) &&
    typeof value.provider === "string" &&
    typeof value.symbol === "string" &&
    (value.underlyingIdentity === null ||
      typeof value.underlyingIdentity === "string") &&
    (value.underlyingTicker === null ||
      typeof value.underlyingTicker === "string")
  );
}

function exposureGroup(value: unknown): value is Record<string, unknown> {
  return (
    record(value) &&
    typeof value.identity === "string" &&
    count(value.positionCount) &&
    Array.isArray(value.positions) &&
    value.positions.every(exposurePosition) &&
    typeof value.knownIndicativeValueUsd === "string" &&
    NON_NEGATIVE_DECIMAL.test(value.knownIndicativeValueUsd) &&
    decimalOrNull(value.knownValueWeightPct) &&
    exposureDenominator(value.weightDenominator) &&
    ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(value.valuationStatus),
    ) &&
    exposureCoverage(value.coverage) &&
    record(value.evidence) &&
    value.evidence.source === "UNIFIED_PORTFOLIO_CURRENT_SNAPSHOT" &&
    ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(value.evidence.status),
    ) &&
    (value.evidence.reason === null ||
      typeof value.evidence.reason === "string")
  );
}

function exposureIntelligence(value: unknown): boolean {
  if (
    !record(value) ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(value.status)) ||
    !exposureDenominator(value.denominator) ||
    !record(value.coverage) ||
    !count(value.coverage.inputPositionCount) ||
    !count(value.coverage.uniquePositionCount) ||
    !count(value.coverage.duplicatePositionCount) ||
    !count(value.coverage.unknownIdentityPositionCount) ||
    !count(value.coverage.knownValuePositionCount) ||
    !count(value.coverage.unknownValuePositionCount) ||
    !decimalOrNull(value.coverage.valuationCoveragePct) ||
    !["COMPLETE", "PARTIAL", "UNAVAILABLE"].includes(
      String(value.coverage.status),
    ) ||
    !record(value.reconciliation) ||
    typeof value.reconciliation.exposureKnownIndicativeValueUsd !== "string" ||
    !NON_NEGATIVE_DECIMAL.test(
      value.reconciliation.exposureKnownIndicativeValueUsd,
    ) ||
    typeof value.reconciliation.portfolioKnownIndicativeValueUsd !== "string" ||
    !NON_NEGATIVE_DECIMAL.test(
      value.reconciliation.portfolioKnownIndicativeValueUsd,
    ) ||
    !["MATCH", "MISMATCH", "UNAVAILABLE"].includes(
      String(value.reconciliation.status),
    ) ||
    !Array.isArray(value.byUnderlying) ||
    !Array.isArray(value.byWrapper) ||
    !Array.isArray(value.byProvider)
  ) {
    return false;
  }

  return (
    value.byUnderlying.every(
      (group) =>
        exposureGroup(group) &&
        typeof group.ticker === "string" &&
        (group.name === null || typeof group.name === "string") &&
        decimalOrNull(group.underlyingEquivalentShares) &&
        typeof group.knownUnderlyingEquivalentShares === "string" &&
        NON_NEGATIVE_DECIMAL.test(group.knownUnderlyingEquivalentShares) &&
        count(group.unknownSharePositionCount) &&
        ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
          String(group.equivalenceStatus),
        ),
    ) &&
    value.byWrapper.every(
      (group) =>
        exposureGroup(group) &&
        typeof group.chainId === "string" &&
        typeof group.contractAddress === "string" &&
        EVM_ADDRESS.test(group.contractAddress) &&
        typeof group.provider === "string" &&
        typeof group.symbol === "string" &&
        (group.underlyingIdentity === null ||
          typeof group.underlyingIdentity === "string") &&
        (group.underlyingTicker === null ||
          typeof group.underlyingTicker === "string"),
    ) &&
    value.byProvider.every(
      (group) =>
        exposureGroup(group) &&
        typeof group.provider === "string" &&
        Array.isArray(group.wrapperContracts) &&
        group.wrapperContracts.every(
          (contract) => typeof contract === "string" && EVM_ADDRESS.test(contract),
        ) &&
        Array.isArray(group.underlyingIdentities) &&
        group.underlyingIdentities.every(
          (identity) => typeof identity === "string",
        ),
    )
  );
}

export function isPortfolioPayload(value: unknown): value is PortfolioPayload {
  if (!record(value)) return false;
  if (
    typeof value.version !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.address !== "string" ||
    !EVM_ADDRESS.test(value.address) ||
    typeof value.chainId !== "string" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_CONFIGURED"].includes(
      String(value.status),
    ) ||
    !Array.isArray(value.positions) ||
    !Array.isArray(value.underlyingExposures) ||
    !Array.isArray(value.balanceChecks) ||
    !record(value.readOnly)
  ) {
    return false;
  }

  if (
    (value.exposures !== undefined &&
      !exposureIntelligence(value.exposures)) ||
    (value.version.startsWith("0.8") &&
      !exposureIntelligence(value.exposures))
  ) {
    return false;
  }

  return (
    Array.isArray(value.readOnly.rpcMethods) &&
    Array.isArray(value.readOnly.transactionMethods) &&
    value.readOnly.transactionMethods.every(
      (method) => typeof method === "string",
    )
  );
}

export function isCurrentPortfolioResponse(
  result: PortfolioPayload | null,
  inputAddress: string,
  submittedAddress: string | null,
): result is PortfolioPayload {
  if (!result || !submittedAddress) return false;
  const current = normalizedAddress(inputAddress);
  const submitted = normalizedAddress(submittedAddress);
  return (
    EVM_ADDRESS.test(current) &&
    current === submitted &&
    normalizedAddress(result.address) === submitted
  );
}

export function portfolioValuePresentation(
  payload: PortfolioPayload,
): {
  label: string;
  value: string | null;
  note: string;
  complete: boolean;
} {
  const summary = payload.summary;
  if (!summary || summary.valuationStatus === "UNAVAILABLE") {
    return {
      label: "INDICATIVE PORTFOLIO VALUE",
      value: null,
      note: "Valuation evidence is unavailable.",
      complete: false,
    };
  }
  if (
    summary.valuationStatus === "AVAILABLE" &&
    summary.indicativeValueUsd !== null
  ) {
    return {
      label: "INDICATIVE PORTFOLIO VALUE",
      value: summary.indicativeValueUsd,
      note: "All detected positive positions have current valuation evidence.",
      complete: true,
    };
  }
  return {
    label: "KNOWN INDICATIVE VALUE",
    value:
      summary.knownIndicativeValueUsd === "0"
        ? null
        : summary.knownIndicativeValueUsd,
    note:
      summary.knownIndicativeValueUsd === "0"
        ? "Partial only — no positive position has complete valuation evidence."
        : "Partial only — positions without valuation evidence are excluded.",
    complete: false,
  };
}

export function buildContinuityHref(params: {
  ticker: string | null;
  contractAddress: string;
  tokenQuantity: string | null;
  identityStatus: string;
}): string | null {
  const ticker = params.ticker?.trim().toUpperCase() ?? "";
  const contract = params.contractAddress.trim().toLowerCase();
  const quantity = params.tokenQuantity?.trim() ?? "";
  if (
    !/^[A-Z0-9.-]{1,24}$/.test(ticker) ||
    !EVM_ADDRESS.test(contract) ||
    params.identityStatus !== "AVAILABLE" ||
    !POSITIVE_DECIMAL.test(quantity) ||
    /^0+(?:\.0+)?$/.test(quantity)
  ) {
    return null;
  }

  const query = new URLSearchParams({
    continuitySource: contract,
    continuityAmount: quantity,
  });
  return `/stock/${encodeURIComponent(ticker)}?${query.toString()}`;
}
