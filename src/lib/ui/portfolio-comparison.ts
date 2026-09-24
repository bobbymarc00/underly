import type { PortfolioPayload } from "@/lib/ui/market-types";
import type { PortfolioComparisonResult } from "@/lib/underly/portfolio-comparison";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SIGNED_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function snapshotSummary(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.generatedAt === "string" &&
    typeof value.blockNumber === "string" &&
    typeof value.blockTag === "string" &&
    ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(value.portfolioStatus),
    ) &&
    ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(value.universeStatus),
    ) &&
    count(value.validatedWrapperCount) &&
    count(value.positionCount) &&
    typeof value.knownIndicativeValueUsd === "string" &&
    SIGNED_DECIMAL.test(value.knownIndicativeValueUsd)
  );
}

export function isPortfolioComparisonResult(
  value: unknown,
): value is PortfolioComparisonResult {
  if (
    !record(value) ||
    value.version !== "0.9-A" ||
    typeof value.generatedAt !== "string" ||
    typeof value.address !== "string" ||
    !EVM_ADDRESS.test(value.address) ||
    typeof value.chainId !== "string" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(value.status)) ||
    !record(value.provenance) ||
    value.provenance.type !== "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES" ||
    value.provenance.independentlyVerified !== false ||
    value.provenance.persisted !== false ||
    !record(value.order) ||
    !["FORWARD", "SAME_BLOCK", "REVERSED"].includes(
      String(value.order.status),
    ) ||
    typeof value.order.blockDelta !== "string" ||
    !record(value.snapshots) ||
    !snapshotSummary(value.snapshots.A) ||
    !snapshotSummary(value.snapshots.B) ||
    !record(value.coverage) ||
    !count(value.coverage.candidateContractCount) ||
    !count(value.coverage.comparableBalanceCount) ||
    !count(value.coverage.changedPositionCount) ||
    !count(value.coverage.unchangedPositionCount) ||
    !count(value.coverage.unavailablePositionCount) ||
    typeof value.coverage.completeWalletComparison !== "boolean" ||
    !record(value.valueComparison) ||
    value.valueComparison.basis !==
      "COMPARABLE_EXACT_WRAPPER_POSITIONS_ONLY" ||
    !SIGNED_DECIMAL.test(String(value.valueComparison.indicativeValueUsdA)) ||
    !SIGNED_DECIMAL.test(String(value.valueComparison.indicativeValueUsdB)) ||
    !SIGNED_DECIMAL.test(
      String(value.valueComparison.signedIndicativeValueDeltaUsd),
    ) ||
    !Array.isArray(value.positions) ||
    !Array.isArray(value.underlyings) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((item) => typeof item === "string") ||
    !record(value.readOnly) ||
    value.readOnly.enabled !== true ||
    !Array.isArray(value.readOnly.networkRequests) ||
    value.readOnly.networkRequests.length !== 0 ||
    !Array.isArray(value.readOnly.transactionMethods) ||
    value.readOnly.transactionMethods.length !== 0
  ) {
    return false;
  }

  return (
    value.positions.every(
      (item) =>
        record(item) &&
        typeof item.positionKey === "string" &&
        typeof item.chainId === "string" &&
        typeof item.contractAddress === "string" &&
        EVM_ADDRESS.test(item.contractAddress) &&
        [
          "APPEARED",
          "DISAPPEARED",
          "CHANGED",
          "UNCHANGED",
          "UNAVAILABLE",
          "COVERAGE_GAP",
          "METADATA_CONFLICT",
          "EVIDENCE_CONFLICT",
        ].includes(String(item.change)),
    ) &&
    value.underlyings.every(
      (item) =>
        record(item) &&
        typeof item.identity === "string" &&
        typeof item.ticker === "string" &&
        Array.isArray(item.positionKeys),
    )
  );
}

export function isCurrentComparisonResponse(params: {
  result: PortfolioComparisonResult | null;
  inputAddress: string;
  snapshotA: PortfolioPayload | null;
  snapshotB: PortfolioPayload | null;
}): params is {
  result: PortfolioComparisonResult;
  inputAddress: string;
  snapshotA: PortfolioPayload;
  snapshotB: PortfolioPayload;
} {
  const { result, snapshotA, snapshotB } = params;
  if (!result || !snapshotA || !snapshotB) return false;
  const address = params.inputAddress.trim().toLowerCase();
  return (
    EVM_ADDRESS.test(address) &&
    snapshotA.address.toLowerCase() === address &&
    snapshotB.address.toLowerCase() === address &&
    result.address.toLowerCase() === address &&
    snapshotA.chainId === snapshotB.chainId &&
    result.chainId === snapshotA.chainId &&
    result.snapshots.A.generatedAt === snapshotA.generatedAt &&
    result.snapshots.B.generatedAt === snapshotB.generatedAt
  );
}
