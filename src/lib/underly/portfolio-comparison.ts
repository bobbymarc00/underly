import Decimal from "decimal.js";

import type {
  PortfolioEvidenceRef,
  UnifiedPortfolioPosition,
} from "@/lib/underly/portfolio";
import type { PortfolioExposureIntelligence } from "@/lib/underly/portfolio-intelligence";

const PreciseDecimal = Decimal.clone({
  precision: 300,
  rounding: Decimal.ROUND_HALF_UP,
});

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UINT = /^[0-9]+$/;
const HEX_QUANTITY = /^0x[0-9a-fA-F]+$/;
const NON_NEGATIVE_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

type PortfolioStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type BalanceCheckStatus =
  | "POSITIVE"
  | "ZERO"
  | "RPC_ERROR"
  | "BALANCE_INVALID"
  | "METADATA_UNAVAILABLE";

export interface PortfolioComparisonSnapshot {
  version: string;
  generatedAt: string;
  address: string;
  chainId: string;
  status: PortfolioStatus;
  scope?: "BSC_TOKENIZED_EQUITY_WRAPPERS_ONLY";
  snapshot: {
    rpcChainId: string;
    blockTag: string;
    blockNumber: string;
    blockTimestamp: string | number | null;
    blockTimestampStatus: "AVAILABLE" | "UNAVAILABLE";
    blockTimestampReason?: string;
  };
  universe: {
    source: string;
    status: PortfolioStatus;
    reason: string | null;
    receivedCount: number;
    chainCandidateCount?: number;
    validatedWrapperCount: number;
    rejectedCount: number;
    rejected: Array<{ contractAddress: string | null; reason: string }>;
  };
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
  positions: UnifiedPortfolioPosition[];
  exposures: PortfolioExposureIntelligence;
  balanceChecks: Array<{
    chainId: string;
    contractAddress: string;
    blockTag: string;
    status: BalanceCheckStatus;
    balanceBaseUnits: string | null;
    error: string | null;
  }>;
  readOnly: {
    enabled: boolean;
    rpcMethods: string[];
    transactionMethods: string[];
    privateKeyRequired: boolean;
    signatureRequired: boolean;
    approvalRequired: boolean;
    quoteRequested: boolean;
    transactionBuilt: boolean;
    simulationRequested: boolean;
  };
}

export type ComparisonBalanceState =
  | "POSITIVE"
  | "ZERO"
  | "UNKNOWN"
  | "COVERAGE_GAP";

export type PositionChangeStatus =
  | "APPEARED"
  | "DISAPPEARED"
  | "CHANGED"
  | "UNCHANGED"
  | "UNAVAILABLE"
  | "COVERAGE_GAP"
  | "METADATA_CONFLICT"
  | "EVIDENCE_CONFLICT";

export interface PortfolioComparisonResult {
  version: "0.9-A";
  generatedAt: string;
  provenance: {
    type: "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES";
    independentlyVerified: false;
    persisted: false;
  };
  address: string;
  chainId: string;
  status: PortfolioStatus;
  order: {
    status: "FORWARD" | "SAME_BLOCK" | "REVERSED";
    blockDelta: string;
    captureTimeStatus: "FORWARD" | "SAME_TIME" | "REVERSED";
    observedOnchainInterval: boolean;
  };
  snapshots: {
    A: ComparisonSnapshotSummary;
    B: ComparisonSnapshotSummary;
  };
  coverage: {
    candidateContractCount: number;
    comparableBalanceCount: number;
    changedPositionCount: number;
    observedDataDifferenceCount: number;
    unchangedPositionCount: number;
    appearedPositionCount: number;
    disappearedPositionCount: number;
    unavailablePositionCount: number;
    coverageGapPositionCount: number;
    metadataConflictPositionCount: number;
    completeWalletComparison: boolean;
    status: "COMPLETE" | "PARTIAL" | "UNAVAILABLE";
  };
  valueComparison: {
    basis: "COMPARABLE_EXACT_WRAPPER_POSITIONS_ONLY";
    comparablePositionCount: number;
    excludedPositionCount: number;
    indicativeValueUsdA: string;
    indicativeValueUsdB: string;
    signedIndicativeValueDeltaUsd: string;
    absoluteIndicativeValueDeltaUsd: string;
    status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  };
  changeSummary:
    | "OBSERVED_CHANGE"
    | "NO_OBSERVED_CHANGE"
    | "INCOMPLETE_COMPARISON"
    | "SAME_BLOCK_NO_ONCHAIN_INTERVAL"
    | "INVALID_SNAPSHOT_ORDER";
  positions: PositionComparison[];
  underlyings: UnderlyingComparison[];
  warnings: string[];
  readOnly: {
    enabled: true;
    networkRequests: [];
    transactionMethods: [];
    quoteRequested: false;
    transactionBuilt: false;
    simulationRequested: false;
  };
}

export interface ComparisonSnapshotSummary {
  generatedAt: string;
  blockNumber: string;
  blockTag: string;
  blockTimestamp: string | number | null;
  blockTimestampStatus: "AVAILABLE" | "UNAVAILABLE";
  portfolioStatus: PortfolioStatus;
  universeStatus: PortfolioStatus;
  validatedWrapperCount: number;
  positionCount: number;
  indicativeValueUsd: string | null;
  knownIndicativeValueUsd: string;
  valuationStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  valuationCoveragePct: string | null;
  unknownValuePositionCount: number;
}

export interface PositionComparison {
  positionKey: string;
  chainId: string;
  contractAddress: string;
  provider: string | null;
  symbol: string | null;
  underlyingIdentity: string | null;
  underlyingTicker: string | null;
  change: PositionChangeStatus;
  balance: {
    A: ComparisonBalanceObservation;
    B: ComparisonBalanceObservation;
    signedRawBaseUnitDelta: string | null;
  };
  quantity: {
    decimalsA: number | null;
    decimalsB: number | null;
    tokenQuantityA: string | null;
    tokenQuantityB: string | null;
    signedTokenQuantityDelta: string | null;
    absoluteTokenQuantityDelta: string | null;
    status: "AVAILABLE" | "UNAVAILABLE" | "CONFLICT";
  };
  equivalence: {
    tokenShareRatioA: string | null;
    tokenShareRatioB: string | null;
    signedTokenShareRatioDifference: string | null;
    underlyingEquivalentSharesA: string | null;
    underlyingEquivalentSharesB: string | null;
    signedUnderlyingEquivalentShareDelta: string | null;
    absoluteUnderlyingEquivalentShareDelta: string | null;
    status: "AVAILABLE" | "UNAVAILABLE" | "CONFLICT";
  };
  valuation: {
    tokenPriceUsdA: string | null;
    tokenPriceUsdB: string | null;
    signedTokenPriceDifferenceUsd: string | null;
    indicativeValueUsdA: string | null;
    indicativeValueUsdB: string | null;
    signedIndicativeValueDeltaUsd: string | null;
    absoluteIndicativeValueDeltaUsd: string | null;
    status: "AVAILABLE" | "UNAVAILABLE" | "CONFLICT";
  };
  evidence: {
    metadataConflicts: string[];
    integrityA: UnifiedPortfolioPosition["integrity"] | null;
    integrityB: UnifiedPortfolioPosition["integrity"] | null;
    status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "CONFLICT";
  };
}

export interface ComparisonBalanceObservation {
  state: ComparisonBalanceState;
  rawBaseUnits: string | null;
  blockTag: string | null;
  evidenceStatus: BalanceCheckStatus | "NOT_IN_VALIDATED_UNIVERSE";
  reason: string | null;
}

export interface UnderlyingComparison {
  identity: string;
  ticker: string;
  name: string | null;
  positionKeys: string[];
  underlyingEquivalentSharesA: string | null;
  underlyingEquivalentSharesB: string | null;
  signedUnderlyingEquivalentShareDelta: string | null;
  comparableIndicativeValueUsdA: string;
  comparableIndicativeValueUsdB: string;
  signedComparableIndicativeValueDeltaUsd: string;
  status: "CHANGED" | "UNCHANGED" | "PARTIAL";
}

export class PortfolioComparisonError extends Error {
  constructor(
    readonly code:
      | "SNAPSHOT_INVALID"
      | "WALLET_MISMATCH"
      | "CHAIN_MISMATCH",
    message: string,
  ) {
    super(message);
    this.name = "PortfolioComparisonError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function decimalOrNull(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" && NON_NEGATIVE_DECIMAL.test(value))
  );
}

function evidence(value: unknown): value is PortfolioEvidenceRef {
  return (
    record(value) &&
    typeof value.source === "string" &&
    ["AVAILABLE", "UNAVAILABLE", "ERROR", "INVALID"].includes(
      String(value.status),
    ) &&
    (value.reason === null || typeof value.reason === "string")
  );
}

function integrity(value: unknown): boolean {
  return (
    record(value) &&
    ["PASS", "WARN", "BLOCKED", "UNKNOWN", "NOT_APPLICABLE"].includes(
      String(value.status),
    ) &&
    ["COMPLETE", "PARTIAL"].includes(String(value.dataCompleteness)) &&
    Array.isArray(value.missingFields) &&
    value.missingFields.every((item) => typeof item === "string")
  );
}

function position(value: unknown): value is UnifiedPortfolioPosition {
  if (!record(value)) return false;
  const underlying = value.underlying;
  const wrapper = value.wrapper;
  const balance = value.balance;
  const equivalence = value.equivalence;
  const valuation = value.valuation;
  return (
    record(underlying) &&
    (underlying.identity === null || typeof underlying.identity === "string") &&
    (underlying.ticker === null || typeof underlying.ticker === "string") &&
    (underlying.name === null || typeof underlying.name === "string") &&
    evidence(underlying.evidence) &&
    record(wrapper) &&
    typeof wrapper.provider === "string" &&
    typeof wrapper.symbol === "string" &&
    typeof wrapper.chainId === "string" &&
    typeof wrapper.contractAddress === "string" &&
    EVM_ADDRESS.test(wrapper.contractAddress) &&
    record(balance) &&
    balance.status === "POSITIVE" &&
    typeof balance.rawBaseUnits === "string" &&
    UINT.test(balance.rawBaseUnits) &&
    BigInt(balance.rawBaseUnits) > 0n &&
    (balance.decimals === null ||
      (Number.isInteger(balance.decimals) &&
        Number(balance.decimals) >= 0 &&
        Number(balance.decimals) <= 255)) &&
    decimalOrNull(balance.quantity) &&
    ["AVAILABLE", "UNAVAILABLE", "ERROR", "INVALID"].includes(
      String(balance.quantityStatus),
    ) &&
    typeof balance.blockTag === "string" &&
    HEX_QUANTITY.test(balance.blockTag) &&
    balance.source === "EVM_JSON_RPC" &&
    record(equivalence) &&
    decimalOrNull(equivalence.tokenShareRatio) &&
    decimalOrNull(equivalence.underlyingEquivalentShares) &&
    ["AVAILABLE", "UNAVAILABLE", "ERROR", "INVALID"].includes(
      String(equivalence.status),
    ) &&
    evidence(equivalence.evidence) &&
    record(valuation) &&
    decimalOrNull(valuation.tokenPriceUsd) &&
    decimalOrNull(valuation.indicativeValueUsd) &&
    ["AVAILABLE", "UNAVAILABLE", "ERROR", "INVALID"].includes(
      String(valuation.status),
    ) &&
    evidence(valuation.tokenPriceEvidence) &&
    integrity(value.integrity) &&
    (balance.quantity === null || balance.quantityStatus === "AVAILABLE") &&
    (equivalence.underlyingEquivalentShares === null ||
      (equivalence.status === "AVAILABLE" &&
        equivalence.evidence.status === "AVAILABLE")) &&
    (valuation.indicativeValueUsd === null ||
      (valuation.status === "AVAILABLE" &&
        valuation.tokenPriceEvidence.status === "AVAILABLE"))
  );
}

function balanceCheck(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.chainId === "string" &&
    typeof value.contractAddress === "string" &&
    EVM_ADDRESS.test(value.contractAddress) &&
    typeof value.blockTag === "string" &&
    HEX_QUANTITY.test(value.blockTag) &&
    [
      "POSITIVE",
      "ZERO",
      "RPC_ERROR",
      "BALANCE_INVALID",
      "METADATA_UNAVAILABLE",
    ].includes(String(value.status)) &&
    (value.balanceBaseUnits === null ||
      (typeof value.balanceBaseUnits === "string" &&
        UINT.test(value.balanceBaseUnits))) &&
    (value.error === null || typeof value.error === "string")
  );
}

function exposureShape(value: unknown): value is PortfolioExposureIntelligence {
  if (!record(value) || !record(value.coverage) || !record(value.denominator)) {
    return false;
  }
  return (
    ["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(value.status)) &&
    count(value.coverage.inputPositionCount) &&
    count(value.coverage.uniquePositionCount) &&
    count(value.coverage.duplicatePositionCount) &&
    count(value.coverage.unknownIdentityPositionCount) &&
    count(value.coverage.knownValuePositionCount) &&
    count(value.coverage.unknownValuePositionCount) &&
    decimalOrNull(value.coverage.valuationCoveragePct) &&
    typeof value.denominator.knownIndicativeValueUsd === "string" &&
    NON_NEGATIVE_DECIMAL.test(value.denominator.knownIndicativeValueUsd) &&
    Array.isArray(value.byUnderlying) &&
    Array.isArray(value.byWrapper) &&
    Array.isArray(value.byProvider)
  );
}

export function isPortfolioComparisonSnapshot(
  value: unknown,
): value is PortfolioComparisonSnapshot {
  if (!record(value)) return false;
  const snapshot = value.snapshot;
  const universe = value.universe;
  const summary = value.summary;
  const readOnly = value.readOnly;
  if (
    typeof value.version !== "string" ||
    !value.version.startsWith("0.8") ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.address !== "string" ||
    !EVM_ADDRESS.test(value.address) ||
    typeof value.chainId !== "string" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(String(value.status)) ||
    !record(snapshot) ||
    typeof snapshot.rpcChainId !== "string" ||
    typeof snapshot.blockTag !== "string" ||
    !HEX_QUANTITY.test(snapshot.blockTag) ||
    typeof snapshot.blockNumber !== "string" ||
    !UINT.test(snapshot.blockNumber) ||
    !(
      snapshot.blockTimestamp === null ||
      typeof snapshot.blockTimestamp === "string" ||
      typeof snapshot.blockTimestamp === "number"
    ) ||
    !["AVAILABLE", "UNAVAILABLE"].includes(
      String(snapshot.blockTimestampStatus),
    ) ||
    !record(universe) ||
    typeof universe.source !== "string" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(universe.status),
    ) ||
    !count(universe.receivedCount) ||
    !count(universe.validatedWrapperCount) ||
    !count(universe.rejectedCount) ||
    !Array.isArray(universe.rejected) ||
    !universe.rejected.every(
      (item) =>
        record(item) &&
        (item.contractAddress === null ||
          typeof item.contractAddress === "string") &&
        typeof item.reason === "string",
    ) ||
    !record(summary) ||
    !count(summary.checkedWrapperCount) ||
    !count(summary.positiveBalanceCount) ||
    !count(summary.provenZeroBalanceCount) ||
    !count(summary.failedBalanceCount) ||
    !count(summary.metadataFailureCount) ||
    !count(summary.positionCount) ||
    !count(summary.underlyingCount) ||
    !decimalOrNull(summary.indicativeValueUsd) ||
    typeof summary.knownIndicativeValueUsd !== "string" ||
    !NON_NEGATIVE_DECIMAL.test(summary.knownIndicativeValueUsd) ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE"].includes(
      String(summary.valuationStatus),
    ) ||
    !Array.isArray(value.positions) ||
    !value.positions.every(position) ||
    !Array.isArray(value.balanceChecks) ||
    !value.balanceChecks.every(balanceCheck) ||
    !exposureShape(value.exposures) ||
    !record(readOnly) ||
    readOnly.enabled !== true ||
    !Array.isArray(readOnly.rpcMethods) ||
    !Array.isArray(readOnly.transactionMethods) ||
    readOnly.transactionMethods.length !== 0 ||
    readOnly.privateKeyRequired !== false ||
    readOnly.signatureRequired !== false ||
    readOnly.approvalRequired !== false ||
    readOnly.quoteRequested !== false ||
    readOnly.transactionBuilt !== false ||
    readOnly.simulationRequested !== false
  ) {
    return false;
  }

  if (
    snapshot.rpcChainId !== value.chainId ||
    BigInt(snapshot.blockTag) !== BigInt(snapshot.blockNumber) ||
    summary.checkedWrapperCount !== value.balanceChecks.length ||
    universe.validatedWrapperCount !== value.balanceChecks.length ||
    summary.positionCount !== value.positions.length ||
    value.exposures.coverage.inputPositionCount !== value.positions.length
  ) {
    return false;
  }

  const contracts = new Set<string>();
  for (const item of value.balanceChecks) {
    const key = `${item.chainId}:${item.contractAddress.toLowerCase()}`;
    if (
      contracts.has(key) ||
      item.chainId !== value.chainId ||
      item.blockTag.toLowerCase() !== snapshot.blockTag.toLowerCase()
    ) {
      return false;
    }
    contracts.add(key);
  }
  const checks = new Map(
    value.balanceChecks.map((item) => [
      `${item.chainId}:${item.contractAddress.toLowerCase()}`,
      item,
    ]),
  );
  const positionContracts = new Set<string>();
  for (const item of value.positions) {
    const positionKey = `${item.wrapper.chainId}:${item.wrapper.contractAddress.toLowerCase()}`;
    const check = checks.get(positionKey);
    if (
      positionContracts.has(positionKey) ||
      item.wrapper.chainId !== value.chainId ||
      item.balance.blockTag.toLowerCase() !== snapshot.blockTag.toLowerCase() ||
      !check ||
      check.status !== "POSITIVE" ||
      check.balanceBaseUnits !== item.balance.rawBaseUnits
    ) {
      return false;
    }
    positionContracts.add(positionKey);
  }
  return true;
}

function decimal(value: string): Decimal {
  return new PreciseDecimal(value);
}

function transport(value: Decimal): string {
  return value.isZero() ? "0" : value.toFixed();
}

function difference(a: string, b: string): {
  signed: string;
  absolute: string;
} {
  const delta = decimal(b).minus(a);
  return { signed: transport(delta), absolute: transport(delta.abs()) };
}

function key(chainId: string, contractAddress: string): string {
  return `${chainId}:${contractAddress.toLowerCase()}`;
}

interface ContractObservation {
  state: ComparisonBalanceState;
  check: PortfolioComparisonSnapshot["balanceChecks"][number] | null;
  position: UnifiedPortfolioPosition | null;
}

function observations(
  snapshot: PortfolioComparisonSnapshot,
): Map<string, ContractObservation> {
  const positionByKey = new Map(
    snapshot.positions.map((item) => [
      key(item.wrapper.chainId, item.wrapper.contractAddress),
      item,
    ]),
  );
  return new Map(
    snapshot.balanceChecks.map((check) => {
      const observationKey = key(check.chainId, check.contractAddress);
      const item = positionByKey.get(observationKey) ?? null;
      const state: ComparisonBalanceState =
        check.status === "ZERO"
          ? "ZERO"
          : check.status === "POSITIVE" && item
            ? "POSITIVE"
            : "UNKNOWN";
      return [observationKey, { state, check, position: item }];
    }),
  );
}

function publicObservation(
  observation: ContractObservation | undefined,
): ComparisonBalanceObservation {
  if (!observation) {
    return {
      state: "COVERAGE_GAP",
      rawBaseUnits: null,
      blockTag: null,
      evidenceStatus: "NOT_IN_VALIDATED_UNIVERSE",
      reason: "CONTRACT_NOT_PRESENT_IN_SNAPSHOT_UNIVERSE",
    };
  }
  return {
    state: observation.state,
    rawBaseUnits:
      observation.state === "ZERO"
        ? "0"
        : observation.check?.balanceBaseUnits ?? null,
    blockTag: observation.check?.blockTag ?? null,
    evidenceStatus:
      observation.check?.status ?? "NOT_IN_VALIDATED_UNIVERSE",
    reason: observation.check?.error ?? null,
  };
}

function zeroOrPositionQuantity(
  observation: ContractObservation | undefined,
): string | null {
  if (observation?.state === "ZERO") return "0";
  return observation?.position?.balance.quantity ?? null;
}

function zeroOrPositionShares(
  observation: ContractObservation | undefined,
): string | null {
  if (observation?.state === "ZERO") return "0";
  return observation?.position?.equivalence.underlyingEquivalentShares ?? null;
}

function zeroOrPositionValue(
  observation: ContractObservation | undefined,
): string | null {
  if (observation?.state === "ZERO") return "0";
  return observation?.position?.valuation.indicativeValueUsd ?? null;
}

function metadataConflicts(
  a: ContractObservation | undefined,
  b: ContractObservation | undefined,
): string[] {
  const left = a?.position;
  const right = b?.position;
  if (!left || !right) return [];
  const conflicts: string[] = [];
  if (left.balance.decimals !== right.balance.decimals) conflicts.push("DECIMALS_MISMATCH");
  if (left.wrapper.provider !== right.wrapper.provider) conflicts.push("PROVIDER_MISMATCH");
  if (left.wrapper.symbol !== right.wrapper.symbol) conflicts.push("WRAPPER_SYMBOL_MISMATCH");
  if (
    left.underlying.evidence.status === "AVAILABLE" &&
    right.underlying.evidence.status === "AVAILABLE" &&
    left.underlying.identity !== right.underlying.identity
  ) {
    conflicts.push("UNDERLYING_IDENTITY_MISMATCH");
  }
  if (
    left.underlying.identity === right.underlying.identity &&
    left.underlying.ticker !== right.underlying.ticker
  ) {
    conflicts.push("UNDERLYING_TICKER_MISMATCH");
  }
  return conflicts;
}

function integrityComplete(position: UnifiedPortfolioPosition | null): boolean {
  return (
    position === null ||
    (position.integrity.dataCompleteness === "COMPLETE" &&
      ["PASS", "NOT_APPLICABLE"].includes(position.integrity.status))
  );
}

function snapshotSummary(
  snapshot: PortfolioComparisonSnapshot,
): ComparisonSnapshotSummary {
  return {
    generatedAt: snapshot.generatedAt,
    blockNumber: snapshot.snapshot.blockNumber,
    blockTag: snapshot.snapshot.blockTag,
    blockTimestamp: snapshot.snapshot.blockTimestamp,
    blockTimestampStatus: snapshot.snapshot.blockTimestampStatus,
    portfolioStatus: snapshot.status,
    universeStatus: snapshot.universe.status,
    validatedWrapperCount: snapshot.universe.validatedWrapperCount,
    positionCount: snapshot.summary.positionCount,
    indicativeValueUsd: snapshot.summary.indicativeValueUsd,
    knownIndicativeValueUsd: snapshot.summary.knownIndicativeValueUsd,
    valuationStatus: snapshot.summary.valuationStatus,
    valuationCoveragePct: snapshot.exposures.coverage.valuationCoveragePct,
    unknownValuePositionCount:
      snapshot.exposures.coverage.unknownValuePositionCount,
  };
}

function deriveChange(params: {
  a: ContractObservation | undefined;
  b: ContractObservation | undefined;
  conflicts: string[];
  sameBlock: boolean;
}): PositionChangeStatus {
  const { a, b, conflicts, sameBlock } = params;
  if (!a || !b) return "COVERAGE_GAP";
  if (a.state === "UNKNOWN" || b.state === "UNKNOWN") return "UNAVAILABLE";
  if (conflicts.length > 0) return "METADATA_CONFLICT";
  if (a.state === "ZERO" && b.state === "POSITIVE") {
    return sameBlock ? "EVIDENCE_CONFLICT" : "APPEARED";
  }
  if (a.state === "POSITIVE" && b.state === "ZERO") {
    return sameBlock ? "EVIDENCE_CONFLICT" : "DISAPPEARED";
  }
  const rawA = a.state === "ZERO" ? "0" : a.check?.balanceBaseUnits;
  const rawB = b.state === "ZERO" ? "0" : b.check?.balanceBaseUnits;
  if (rawA === rawB) return "UNCHANGED";
  return sameBlock ? "EVIDENCE_CONFLICT" : "CHANGED";
}

function comparePosition(params: {
  positionKey: string;
  a: ContractObservation | undefined;
  b: ContractObservation | undefined;
  sameBlock: boolean;
}): PositionComparison {
  const { positionKey, a, b, sameBlock } = params;
  const source = b?.position ?? a?.position ?? null;
  const [chainId, contractAddress] = positionKey.split(":");
  const conflicts = metadataConflicts(a, b);
  const change = deriveChange({ a, b, conflicts, sameBlock });
  const provenA = a?.state === "ZERO" || a?.state === "POSITIVE";
  const provenB = b?.state === "ZERO" || b?.state === "POSITIVE";
  const rawA = provenA
    ? a?.state === "ZERO"
      ? "0"
      : a?.check?.balanceBaseUnits ?? null
    : null;
  const rawB = provenB
    ? b?.state === "ZERO"
      ? "0"
      : b?.check?.balanceBaseUnits ?? null
    : null;
  const decimalsA = a?.position?.balance.decimals ?? null;
  const decimalsB = b?.position?.balance.decimals ?? null;
  const quantityA = zeroOrPositionQuantity(a);
  const quantityB = zeroOrPositionQuantity(b);
  const decimalsConflict = conflicts.includes("DECIMALS_MISMATCH");
  const quantitiesComparable =
    provenA &&
    provenB &&
    !decimalsConflict &&
    quantityA !== null &&
    quantityB !== null;
  const quantityDelta = quantitiesComparable
    ? difference(quantityA, quantityB)
    : null;

  const positionA = a?.position ?? null;
  const positionB = b?.position ?? null;
  const identityA = positionA?.underlying.identity ?? null;
  const identityB = positionB?.underlying.identity ?? null;
  const identityAvailableA =
    !positionA || positionA.underlying.evidence.status === "AVAILABLE";
  const identityAvailableB =
    !positionB || positionB.underlying.evidence.status === "AVAILABLE";
  const equivalenceCompatible =
    provenA &&
    provenB &&
    !conflicts.includes("UNDERLYING_IDENTITY_MISMATCH") &&
    !conflicts.includes("UNDERLYING_TICKER_MISMATCH") &&
    identityAvailableA &&
    identityAvailableB &&
    (identityA === null || identityB === null || identityA === identityB);
  const sharesA = zeroOrPositionShares(a);
  const sharesB = zeroOrPositionShares(b);
  const shareDelta =
    equivalenceCompatible && sharesA !== null && sharesB !== null
      ? difference(sharesA, sharesB)
      : null;
  const ratioA = positionA?.equivalence.tokenShareRatio ?? null;
  const ratioB = positionB?.equivalence.tokenShareRatio ?? null;
  const ratioDifference =
    ratioA !== null && ratioB !== null ? difference(ratioA, ratioB).signed : null;

  const valuationConflict = conflicts.some((item) =>
    [
      "PROVIDER_MISMATCH",
      "WRAPPER_SYMBOL_MISMATCH",
      "UNDERLYING_IDENTITY_MISMATCH",
    ].includes(item),
  );
  const valueA = zeroOrPositionValue(a);
  const valueB = zeroOrPositionValue(b);
  const valuesComparable =
    provenA && provenB && !valuationConflict && valueA !== null && valueB !== null;
  const valueDelta = valuesComparable ? difference(valueA, valueB) : null;
  const priceA = positionA?.valuation.tokenPriceUsd ?? null;
  const priceB = positionB?.valuation.tokenPriceUsd ?? null;
  const priceDifference =
    priceA !== null && priceB !== null ? difference(priceA, priceB).signed : null;
  const completeIntegrity =
    integrityComplete(positionA) && integrityComplete(positionB);

  return {
    positionKey,
    chainId,
    contractAddress,
    provider: source?.wrapper.provider ?? null,
    symbol: source?.wrapper.symbol ?? null,
    underlyingIdentity:
      identityA && identityB && identityA !== identityB
        ? null
        : identityB ?? identityA,
    underlyingTicker:
      positionB?.underlying.ticker ?? positionA?.underlying.ticker ?? null,
    change,
    balance: {
      A: publicObservation(a),
      B: publicObservation(b),
      signedRawBaseUnitDelta:
        rawA !== null && rawB !== null
          ? (BigInt(rawB) - BigInt(rawA)).toString(10)
          : null,
    },
    quantity: {
      decimalsA,
      decimalsB,
      tokenQuantityA: quantityA,
      tokenQuantityB: quantityB,
      signedTokenQuantityDelta: quantityDelta?.signed ?? null,
      absoluteTokenQuantityDelta: quantityDelta?.absolute ?? null,
      status: decimalsConflict
        ? "CONFLICT"
        : quantitiesComparable
          ? "AVAILABLE"
          : "UNAVAILABLE",
    },
    equivalence: {
      tokenShareRatioA: ratioA,
      tokenShareRatioB: ratioB,
      signedTokenShareRatioDifference: ratioDifference,
      underlyingEquivalentSharesA: sharesA,
      underlyingEquivalentSharesB: sharesB,
      signedUnderlyingEquivalentShareDelta: shareDelta?.signed ?? null,
      absoluteUnderlyingEquivalentShareDelta: shareDelta?.absolute ?? null,
      status: conflicts.some((item) => item.includes("UNDERLYING"))
        ? "CONFLICT"
        : shareDelta
          ? "AVAILABLE"
          : "UNAVAILABLE",
    },
    valuation: {
      tokenPriceUsdA: priceA,
      tokenPriceUsdB: priceB,
      signedTokenPriceDifferenceUsd: priceDifference,
      indicativeValueUsdA: valueA,
      indicativeValueUsdB: valueB,
      signedIndicativeValueDeltaUsd: valueDelta?.signed ?? null,
      absoluteIndicativeValueDeltaUsd: valueDelta?.absolute ?? null,
      status: valuationConflict
        ? "CONFLICT"
        : valueDelta
          ? "AVAILABLE"
          : "UNAVAILABLE",
    },
    evidence: {
      metadataConflicts: conflicts,
      integrityA: positionA?.integrity ?? null,
      integrityB: positionB?.integrity ?? null,
      status:
        conflicts.length > 0
          ? "CONFLICT"
          : !provenA || !provenB
            ? "UNAVAILABLE"
            : completeIntegrity
              ? "AVAILABLE"
              : "PARTIAL",
    },
  };
}

function underlyingComparisons(
  positions: PositionComparison[],
): UnderlyingComparison[] {
  const grouped = new Map<string, PositionComparison[]>();
  for (const item of positions) {
    if (
      !item.underlyingIdentity ||
      !item.underlyingTicker ||
      item.evidence.metadataConflicts.some((conflict) =>
        conflict.includes("UNDERLYING"),
      )
    ) {
      continue;
    }
    const current = grouped.get(item.underlyingIdentity) ?? [];
    current.push(item);
    grouped.set(item.underlyingIdentity, current);
  }

  return Array.from(grouped.entries())
    .map(([identity, group]) => {
      const sharesAvailable = group.every(
        (item) =>
          item.equivalence.underlyingEquivalentSharesA !== null &&
          item.equivalence.underlyingEquivalentSharesB !== null &&
          item.equivalence.status === "AVAILABLE",
      );
      const knownSharesA = group.reduce(
        (sum, item) =>
          item.equivalence.underlyingEquivalentSharesA === null
            ? sum
            : sum.plus(item.equivalence.underlyingEquivalentSharesA),
        new PreciseDecimal(0),
      );
      const knownSharesB = group.reduce(
        (sum, item) =>
          item.equivalence.underlyingEquivalentSharesB === null
            ? sum
            : sum.plus(item.equivalence.underlyingEquivalentSharesB),
        new PreciseDecimal(0),
      );
      const comparableValues = group.filter(
        (item) => item.valuation.status === "AVAILABLE",
      );
      const valueA = comparableValues.reduce(
        (sum, item) => sum.plus(item.valuation.indicativeValueUsdA ?? "0"),
        new PreciseDecimal(0),
      );
      const valueB = comparableValues.reduce(
        (sum, item) => sum.plus(item.valuation.indicativeValueUsdB ?? "0"),
        new PreciseDecimal(0),
      );
      const shareDelta = knownSharesB.minus(knownSharesA);
      const valueDelta = valueB.minus(valueA);
      const partial =
        !sharesAvailable ||
        comparableValues.length !== group.length ||
        group.some((item) => item.evidence.status !== "AVAILABLE");
      return {
        identity,
        ticker: group[0].underlyingTicker as string,
        name: null,
        positionKeys: group.map((item) => item.positionKey).sort(),
        underlyingEquivalentSharesA: sharesAvailable
          ? transport(knownSharesA)
          : null,
        underlyingEquivalentSharesB: sharesAvailable
          ? transport(knownSharesB)
          : null,
        signedUnderlyingEquivalentShareDelta: sharesAvailable
          ? transport(shareDelta)
          : null,
        comparableIndicativeValueUsdA: transport(valueA),
        comparableIndicativeValueUsdB: transport(valueB),
        signedComparableIndicativeValueDeltaUsd: transport(valueDelta),
        status: partial
          ? ("PARTIAL" as const)
          : shareDelta.isZero() && valueDelta.isZero()
            ? ("UNCHANGED" as const)
            : ("CHANGED" as const),
      };
    })
    .sort((a, b) => a.identity.localeCompare(b.identity));
}

export function buildPortfolioSnapshotComparison(params: {
  snapshotA: PortfolioComparisonSnapshot;
  snapshotB: PortfolioComparisonSnapshot;
  generatedAt?: string;
}): PortfolioComparisonResult {
  const { snapshotA, snapshotB } = params;
  if (
    !isPortfolioComparisonSnapshot(snapshotA) ||
    !isPortfolioComparisonSnapshot(snapshotB)
  ) {
    throw new PortfolioComparisonError(
      "SNAPSHOT_INVALID",
      "Both portfolio snapshots must satisfy the v0.8 comparison contract.",
    );
  }
  if (snapshotA.address.toLowerCase() !== snapshotB.address.toLowerCase()) {
    throw new PortfolioComparisonError(
      "WALLET_MISMATCH",
      "Portfolio snapshots must use the same wallet address.",
    );
  }
  if (snapshotA.chainId !== snapshotB.chainId) {
    throw new PortfolioComparisonError(
      "CHAIN_MISMATCH",
      "Portfolio snapshots must use the same chain ID.",
    );
  }

  const blockA = BigInt(snapshotA.snapshot.blockNumber);
  const blockB = BigInt(snapshotB.snapshot.blockNumber);
  const blockDelta = blockB - blockA;
  const orderStatus =
    blockDelta > 0n ? "FORWARD" : blockDelta === 0n ? "SAME_BLOCK" : "REVERSED";
  const timeA = Date.parse(snapshotA.generatedAt);
  const timeB = Date.parse(snapshotB.generatedAt);
  const captureTimeStatus =
    timeB > timeA ? "FORWARD" : timeB === timeA ? "SAME_TIME" : "REVERSED";
  const observationA = observations(snapshotA);
  const observationB = observations(snapshotB);
  const allKeys = new Set([...observationA.keys(), ...observationB.keys()]);
  const candidateKeys = Array.from(allKeys)
    .filter((item) => {
      const a = observationA.get(item)?.state;
      const b = observationB.get(item)?.state;
      return a === "POSITIVE" || b === "POSITIVE" || a === "UNKNOWN" || b === "UNKNOWN";
    })
    .sort();
  const positions = candidateKeys.map((positionKey) =>
    comparePosition({
      positionKey,
      a: observationA.get(positionKey),
      b: observationB.get(positionKey),
      sameBlock: orderStatus === "SAME_BLOCK",
    }),
  );

  const countChange = (change: PositionChangeStatus) =>
    positions.filter((item) => item.change === change).length;
  const unavailablePositionCount =
    countChange("UNAVAILABLE") + countChange("EVIDENCE_CONFLICT");
  const coverageGapPositionCount = countChange("COVERAGE_GAP");
  const metadataConflictPositionCount = countChange("METADATA_CONFLICT");
  const comparable = positions.filter(
    (item) => item.valuation.status === "AVAILABLE",
  );
  const subtotalA = comparable.reduce(
    (sum, item) => sum.plus(item.valuation.indicativeValueUsdA ?? "0"),
    new PreciseDecimal(0),
  );
  const subtotalB = comparable.reduce(
    (sum, item) => sum.plus(item.valuation.indicativeValueUsdB ?? "0"),
    new PreciseDecimal(0),
  );
  const subtotalDelta = subtotalB.minus(subtotalA);
  const completeIntegrity = positions.every(
    (item) => item.evidence.status === "AVAILABLE",
  );
  const completeWalletComparison =
    orderStatus === "FORWARD" &&
    captureTimeStatus === "FORWARD" &&
    snapshotA.status === "AVAILABLE" &&
    snapshotB.status === "AVAILABLE" &&
    snapshotA.universe.status === "AVAILABLE" &&
    snapshotB.universe.status === "AVAILABLE" &&
    unavailablePositionCount === 0 &&
    coverageGapPositionCount === 0 &&
    metadataConflictPositionCount === 0 &&
    completeIntegrity;
  const coverageStatus =
    positions.length > 0 && comparable.length === 0
      ? "UNAVAILABLE"
      : completeWalletComparison
        ? "COMPLETE"
        : "PARTIAL";
  const status: PortfolioStatus =
    coverageStatus === "UNAVAILABLE" ? "UNAVAILABLE" : completeWalletComparison ? "AVAILABLE" : "PARTIAL";
  const changedPositionCount =
    countChange("APPEARED") + countChange("DISAPPEARED") + countChange("CHANGED");
  const observedDataDifferenceCount = positions.filter((item) => {
    const differences = [
      item.quantity.signedTokenQuantityDelta,
      item.equivalence.signedTokenShareRatioDifference,
      item.equivalence.signedUnderlyingEquivalentShareDelta,
      item.valuation.signedTokenPriceDifferenceUsd,
      item.valuation.signedIndicativeValueDeltaUsd,
    ];
    return differences.some(
      (difference) => difference !== null && !new PreciseDecimal(difference).isZero(),
    );
  }).length;
  const warnings = [
    "Snapshots are client-supplied validated portfolio responses held only in browser-session memory; they are not independently or cryptographically verified archives.",
    "Token prices and token/share ratios belong to their own capture. Snapshot B values are never applied retroactively to Snapshot A.",
    "Indicative value change is not P&L, return, cost basis, market performance, a trade classification, or evidence of a dividend or transfer.",
    "Provider price and metadata observations may change asynchronously from the wallet balance block.",
  ];
  if (snapshotA.snapshot.blockTimestampStatus === "UNAVAILABLE" || snapshotB.snapshot.blockTimestampStatus === "UNAVAILABLE") {
    warnings.push("At least one block timestamp is unavailable and remains UNKNOWN.");
  }
  if (orderStatus === "SAME_BLOCK") {
    warnings.push("Both snapshots use the same wallet block; no between-block on-chain change is claimed.");
  }
  if (orderStatus === "REVERSED" || captureTimeStatus !== "FORWARD") {
    warnings.push("Snapshot order is not a valid later-capture sequence; deltas are arithmetic B minus A only.");
  }
  if (!completeWalletComparison) {
    warnings.push("Comparison is not complete for the entire wallet scope; consult coverage and excluded positions.");
  }

  const changeSummary: PortfolioComparisonResult["changeSummary"] =
    orderStatus === "REVERSED" || captureTimeStatus === "REVERSED"
      ? "INVALID_SNAPSHOT_ORDER"
      : orderStatus === "SAME_BLOCK"
        ? "SAME_BLOCK_NO_ONCHAIN_INTERVAL"
        : unavailablePositionCount > 0 || coverageGapPositionCount > 0 || metadataConflictPositionCount > 0
          ? "INCOMPLETE_COMPARISON"
          : observedDataDifferenceCount > 0
            ? "OBSERVED_CHANGE"
            : "NO_OBSERVED_CHANGE";

  return {
    version: "0.9-A",
    generatedAt: params.generatedAt ?? new Date().toISOString(),
    provenance: {
      type: "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES",
      independentlyVerified: false,
      persisted: false,
    },
    address: snapshotA.address.toLowerCase(),
    chainId: snapshotA.chainId,
    status,
    order: {
      status: orderStatus,
      blockDelta: blockDelta.toString(10),
      captureTimeStatus,
      observedOnchainInterval:
        orderStatus === "FORWARD" && captureTimeStatus === "FORWARD",
    },
    snapshots: {
      A: snapshotSummary(snapshotA),
      B: snapshotSummary(snapshotB),
    },
    coverage: {
      candidateContractCount: positions.length,
      comparableBalanceCount: positions.filter(
        (item) =>
          ["POSITIVE", "ZERO"].includes(item.balance.A.state) &&
          ["POSITIVE", "ZERO"].includes(item.balance.B.state),
      ).length,
      changedPositionCount,
      observedDataDifferenceCount,
      unchangedPositionCount: countChange("UNCHANGED"),
      appearedPositionCount: countChange("APPEARED"),
      disappearedPositionCount: countChange("DISAPPEARED"),
      unavailablePositionCount,
      coverageGapPositionCount,
      metadataConflictPositionCount,
      completeWalletComparison,
      status: coverageStatus,
    },
    valueComparison: {
      basis: "COMPARABLE_EXACT_WRAPPER_POSITIONS_ONLY",
      comparablePositionCount: comparable.length,
      excludedPositionCount: positions.length - comparable.length,
      indicativeValueUsdA: transport(subtotalA),
      indicativeValueUsdB: transport(subtotalB),
      signedIndicativeValueDeltaUsd: transport(subtotalDelta),
      absoluteIndicativeValueDeltaUsd: transport(subtotalDelta.abs()),
      status:
        comparable.length === 0 && positions.length > 0
          ? "UNAVAILABLE"
          : comparable.length === positions.length
            ? "AVAILABLE"
            : "PARTIAL",
    },
    changeSummary,
    positions,
    underlyings: underlyingComparisons(positions),
    warnings,
    readOnly: {
      enabled: true,
      networkRequests: [],
      transactionMethods: [],
      quoteRequested: false,
      transactionBuilt: false,
      simulationRequested: false,
    },
  };
}
