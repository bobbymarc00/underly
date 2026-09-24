import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import type { UnifiedPortfolioPosition } from "@/lib/underly/portfolio";
import {
  buildPortfolioSnapshotComparison,
  isPortfolioComparisonSnapshot,
  PortfolioComparisonError,
  type PortfolioComparisonSnapshot,
} from "@/lib/underly/portfolio-comparison";

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_WALLET = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CONTRACT_A = "0x1111111111111111111111111111111111111111";
const CONTRACT_B = "0x2222222222222222222222222222222222222222";

function evidence(
  status: "AVAILABLE" | "UNAVAILABLE" | "ERROR" | "INVALID" = "AVAILABLE",
) {
  return { source: "TEST", status, reason: status === "AVAILABLE" ? null : "MISSING" };
}

function position(params: {
  contract: string;
  raw: string;
  quantity: string;
  decimals?: number;
  provider?: string;
  symbol?: string;
  identity?: string | null;
  ticker?: string | null;
  ratio?: string | null;
  shares?: string | null;
  price?: string | null;
  value?: string | null;
  integrityComplete?: boolean;
}): UnifiedPortfolioPosition {
  const availableRatio = params.ratio !== null;
  const availableValue = params.price !== null && params.value !== null;
  return {
    underlying: {
      identity: params.identity === undefined ? "BINANCE_RWA:56:NVDA" : params.identity,
      ticker: params.ticker === undefined ? "NVDA" : params.ticker,
      name: "NVIDIA Corp",
      evidence: evidence(params.identity === null ? "UNAVAILABLE" : "AVAILABLE"),
    },
    wrapper: {
      provider: params.provider ?? "provider-a",
      symbol: params.symbol ?? "NVDAx",
      chainId: "56",
      contractAddress: params.contract,
    },
    balance: {
      status: "POSITIVE",
      rawBaseUnits: params.raw,
      rawHex: null,
      decimals: params.decimals ?? 18,
      quantity: params.quantity,
      quantityStatus: "AVAILABLE",
      blockTag: "0x64",
      source: "EVM_JSON_RPC",
    },
    equivalence: {
      tokenShareRatio: params.ratio === undefined ? "1" : params.ratio,
      underlyingEquivalentShares:
        params.shares === undefined ? params.quantity : params.shares,
      status: availableRatio ? "AVAILABLE" : "UNAVAILABLE",
      evidence: evidence(availableRatio ? "AVAILABLE" : "UNAVAILABLE"),
    },
    valuation: {
      tokenPriceUsd: params.price === undefined ? "10" : params.price,
      referencePriceUsd: params.price === undefined ? "10" : params.price,
      indicativeValueUsd: params.value === undefined ? "10" : params.value,
      referenceValueUsd: params.value === undefined ? "10" : params.value,
      status: availableValue ? "AVAILABLE" : "UNAVAILABLE",
      tokenPriceEvidence: evidence(availableValue ? "AVAILABLE" : "UNAVAILABLE"),
      referencePriceEvidence: evidence(availableValue ? "AVAILABLE" : "UNAVAILABLE"),
    },
    marketSession: null,
    actionGuard: null,
    integrity: {
      status: params.integrityComplete === false ? "UNKNOWN" : "PASS",
      dataCompleteness: params.integrityComplete === false ? "PARTIAL" : "COMPLETE",
      missingFields: params.integrityComplete === false ? ["attestation"] : [],
    },
    evidence: {
      identity: evidence(params.identity === null ? "UNAVAILABLE" : "AVAILABLE"),
      decimals: evidence(),
      ratio: evidence(availableRatio ? "AVAILABLE" : "UNAVAILABLE"),
      tokenPrice: evidence(availableValue ? "AVAILABLE" : "UNAVAILABLE"),
      referencePrice: evidence(availableValue ? "AVAILABLE" : "UNAVAILABLE"),
      marketSession: evidence("UNAVAILABLE"),
      actionGuard: evidence("UNAVAILABLE"),
      integrity: evidence(params.integrityComplete === false ? "UNAVAILABLE" : "AVAILABLE"),
      sources: {},
    },
  };
}

function snapshot(params: {
  block: number;
  generatedAt?: string;
  address?: string;
  chainId?: string;
  status?: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  positions?: UnifiedPortfolioPosition[];
  checks?: PortfolioComparisonSnapshot["balanceChecks"];
}): PortfolioComparisonSnapshot {
  const blockTag = `0x${params.block.toString(16)}`;
  const positions = (params.positions ?? []).map((item) => ({
    ...item,
    balance: { ...item.balance, blockTag },
  }));
  const checks =
    params.checks ??
    positions.map((item) => ({
      chainId: item.wrapper.chainId,
      contractAddress: item.wrapper.contractAddress,
      blockTag,
      status: "POSITIVE" as const,
      balanceBaseUnits: item.balance.rawBaseUnits,
      error: null,
    }));
  const knownValue = positions
    .reduce(
      (sum, item) => sum.plus(item.valuation.indicativeValueUsd ?? "0"),
      new Decimal(0),
    )
    .toFixed();
  return {
    version: "0.8-A",
    generatedAt:
      params.generatedAt ?? `2026-09-23T00:00:${String(params.block).padStart(2, "0")}.000Z`,
    address: params.address ?? WALLET,
    chainId: params.chainId ?? "56",
    status: params.status ?? "AVAILABLE",
    scope: "BSC_TOKENIZED_EQUITY_WRAPPERS_ONLY",
    snapshot: {
      rpcChainId: params.chainId ?? "56",
      blockTag,
      blockNumber: String(params.block),
      blockTimestamp: null,
      blockTimestampStatus: "UNAVAILABLE",
      blockTimestampReason: "TEST_TIMESTAMP_UNAVAILABLE",
    },
    universe: {
      source: "TEST_UNIVERSE",
      status: "AVAILABLE",
      reason: null,
      receivedCount: checks.length,
      chainCandidateCount: checks.length,
      validatedWrapperCount: checks.length,
      rejectedCount: 0,
      rejected: [],
    },
    summary: {
      checkedWrapperCount: checks.length,
      positiveBalanceCount: positions.length,
      provenZeroBalanceCount: checks.filter((item) => item.status === "ZERO").length,
      failedBalanceCount: checks.filter((item) => item.status === "RPC_ERROR").length,
      metadataFailureCount: 0,
      positionCount: positions.length,
      underlyingCount: new Set(positions.map((item) => item.underlying.identity)).size,
      indicativeValueUsd: positions.every(
        (item) => item.valuation.indicativeValueUsd !== null,
      )
        ? knownValue
        : null,
      knownIndicativeValueUsd: knownValue,
      valuationStatus: positions.every(
        (item) => item.valuation.indicativeValueUsd !== null,
      )
        ? "AVAILABLE"
        : "PARTIAL",
    },
    positions,
    exposures: {
      status: params.status ?? "AVAILABLE",
      denominator: {
        basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
        knownIndicativeValueUsd: knownValue,
        knownValuePositionCount: positions.filter(
          (item) => item.valuation.indicativeValueUsd !== null,
        ).length,
        unknownValuePositionCount: positions.filter(
          (item) => item.valuation.indicativeValueUsd === null,
        ).length,
        status: knownValue === "0" ? "UNAVAILABLE" : "AVAILABLE",
      },
      coverage: {
        inputPositionCount: positions.length,
        uniquePositionCount: positions.length,
        duplicatePositionCount: 0,
        unknownIdentityPositionCount: 0,
        knownValuePositionCount: positions.filter(
          (item) => item.valuation.indicativeValueUsd !== null,
        ).length,
        unknownValuePositionCount: positions.filter(
          (item) => item.valuation.indicativeValueUsd === null,
        ).length,
        valuationCoveragePct: positions.length === 0 ? null : "100",
        status: "COMPLETE",
      },
      reconciliation: {
        exposureKnownIndicativeValueUsd: knownValue,
        portfolioKnownIndicativeValueUsd: knownValue,
        status: "MATCH",
      },
      byUnderlying: [],
      byWrapper: [],
      byProvider: [],
    },
    balanceChecks: checks,
    readOnly: {
      enabled: true,
      rpcMethods: ["eth_chainId", "eth_blockNumber", "eth_call"],
      transactionMethods: [],
      privateKeyRequired: false,
      signatureRequired: false,
      approvalRequired: false,
      quoteRequested: false,
      transactionBuilt: false,
      simulationRequested: false,
    },
  };
}

function zeroCheck(contract: string, block: number) {
  return {
    chainId: "56",
    contractAddress: contract,
    blockTag: `0x${block.toString(16)}`,
    status: "ZERO" as const,
    balanceBaseUnits: "0",
    error: null,
  };
}

describe("portfolio snapshot comparison", () => {
  it("requires valid snapshots for the same wallet and chain", () => {
    const a = snapshot({ block: 1 });
    expect(isPortfolioComparisonSnapshot(a)).toBe(true);
    expect(() =>
      buildPortfolioSnapshotComparison({
        snapshotA: a,
        snapshotB: snapshot({ block: 2, address: OTHER_WALLET }),
      }),
    ).toThrowError(expect.objectContaining({ code: "WALLET_MISMATCH" }));
    expect(() =>
      buildPortfolioSnapshotComparison({
        snapshotA: a,
        snapshotB: snapshot({ block: 2, chainId: "1" }),
      }),
    ).toThrowError(expect.objectContaining({ code: "CHAIN_MISMATCH" }));
    expect(PortfolioComparisonError).toBeDefined();
  });

  it("never swaps different exact wrappers even when their tickers match", () => {
    const a = position({ contract: CONTRACT_A, raw: "1", quantity: "1", identity: "ID:A", ticker: "SAME" });
    const b = position({ contract: CONTRACT_B, raw: "2", quantity: "2", identity: "ID:B", ticker: "SAME" });
    const result = buildPortfolioSnapshotComparison({
      snapshotA: snapshot({ block: 1, positions: [a], checks: [
        { chainId: "56", contractAddress: CONTRACT_A, blockTag: "0x1", status: "POSITIVE", balanceBaseUnits: "1", error: null },
        zeroCheck(CONTRACT_B, 1),
      ] }),
      snapshotB: snapshot({ block: 2, positions: [b], checks: [
        zeroCheck(CONTRACT_A, 2),
        { chainId: "56", contractAddress: CONTRACT_B, blockTag: "0x2", status: "POSITIVE", balanceBaseUnits: "2", error: null },
      ] }),
    });
    expect(result.positions.map((item) => item.change)).toEqual([
      "DISAPPEARED",
      "APPEARED",
    ]);
    expect(result.underlyings).toHaveLength(2);
  });

  it("distinguishes positive changes, appearances, and disappearances", () => {
    const a = position({ contract: CONTRACT_A, raw: "100", quantity: "1", value: "10" });
    const b = position({ contract: CONTRACT_A, raw: "250", quantity: "2.5", value: "25" });
    const appeared = position({ contract: CONTRACT_B, raw: "3", quantity: "3", value: "30" });
    const result = buildPortfolioSnapshotComparison({
      snapshotA: snapshot({ block: 1, positions: [a], checks: [
        { chainId: "56", contractAddress: CONTRACT_A, blockTag: "0x1", status: "POSITIVE", balanceBaseUnits: "100", error: null },
        zeroCheck(CONTRACT_B, 1),
      ] }),
      snapshotB: snapshot({ block: 2, positions: [b, appeared], checks: [
        { chainId: "56", contractAddress: CONTRACT_A, blockTag: "0x2", status: "POSITIVE", balanceBaseUnits: "250", error: null },
        { chainId: "56", contractAddress: CONTRACT_B, blockTag: "0x2", status: "POSITIVE", balanceBaseUnits: "3", error: null },
      ] }),
    });
    expect(result.positions[0]).toMatchObject({ change: "CHANGED", quantity: { signedTokenQuantityDelta: "1.5" } });
    expect(result.positions[1]).toMatchObject({ change: "APPEARED", quantity: { tokenQuantityA: "0", signedTokenQuantityDelta: "3" } });
  });

  it("keeps UNKNOWN distinct from zero", () => {
    const positive = position({ contract: CONTRACT_A, raw: "1", quantity: "1" });
    const result = buildPortfolioSnapshotComparison({
      snapshotA: snapshot({ block: 1, checks: [{ chainId: "56", contractAddress: CONTRACT_A, blockTag: "0x1", status: "RPC_ERROR", balanceBaseUnits: null, error: "RPC" }] }),
      snapshotB: snapshot({ block: 2, positions: [positive] }),
    });
    expect(result.positions[0]).toMatchObject({
      change: "UNAVAILABLE",
      balance: { A: { state: "UNKNOWN" } },
      quantity: { signedTokenQuantityDelta: null },
    });
  });

  it("treats a missing universe contract as a coverage gap", () => {
    const positive = position({ contract: CONTRACT_A, raw: "1", quantity: "1" });
    const result = buildPortfolioSnapshotComparison({
      snapshotA: snapshot({ block: 1, positions: [positive] }),
      snapshotB: snapshot({ block: 2 }),
    });
    expect(result.positions[0]).toMatchObject({
      change: "COVERAGE_GAP",
      balance: { B: { state: "COVERAGE_GAP" } },
    });
  });

  it("preserves each snapshot ratio and price without retroactive normalization", () => {
    const a = position({ contract: CONTRACT_A, raw: "2", quantity: "2", ratio: "1", shares: "2", price: "10", value: "20" });
    const b = position({ contract: CONTRACT_A, raw: "2", quantity: "2", ratio: "2", shares: "4", price: "12", value: "24" });
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, positions: [a] }), snapshotB: snapshot({ block: 2, positions: [b] }) });
    expect(result.positions[0]).toMatchObject({
      quantity: { signedTokenQuantityDelta: "0" },
      equivalence: { tokenShareRatioA: "1", tokenShareRatioB: "2", signedTokenShareRatioDifference: "1", signedUnderlyingEquivalentShareDelta: "2" },
      valuation: { tokenPriceUsdA: "10", tokenPriceUsdB: "12", signedTokenPriceDifferenceUsd: "2", signedIndicativeValueDeltaUsd: "4" },
    });
    expect(result.coverage).toMatchObject({
      changedPositionCount: 0,
      observedDataDifferenceCount: 1,
    });
    expect(result.changeSummary).toBe("OBSERVED_CHANGE");
  });

  it("blocks affected dimensions on decimals and metadata conflicts", () => {
    const a = position({ contract: CONTRACT_A, raw: "100", quantity: "1", decimals: 2, identity: "ID:A" });
    const b = position({ contract: CONTRACT_A, raw: "100", quantity: "0.1", decimals: 3, identity: "ID:B" });
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, positions: [a] }), snapshotB: snapshot({ block: 2, positions: [b] }) });
    expect(result.positions[0]).toMatchObject({
      change: "METADATA_CONFLICT",
      quantity: { status: "CONFLICT", signedTokenQuantityDelta: null },
      equivalence: { status: "CONFLICT" },
      evidence: { metadataConflicts: expect.arrayContaining(["DECIMALS_MISMATCH", "UNDERLYING_IDENTITY_MISMATCH"]) },
    });
  });

  it("retains exact precision for balances and value deltas", () => {
    const a = position({ contract: CONTRACT_A, raw: "1000000000000000001", quantity: "1.000000000000000001", value: "1000000000000000000.000000000000000001" });
    const b = position({ contract: CONTRACT_A, raw: "1000000000000000002", quantity: "1.000000000000000002", value: "1000000000000000000.000000000000000003" });
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, positions: [a] }), snapshotB: snapshot({ block: 2, positions: [b] }) });
    expect(result.positions[0].quantity.signedTokenQuantityDelta).toBe("0.000000000000000001");
    expect(result.positions[0].valuation.signedIndicativeValueDeltaUsd).toBe("0.000000000000000002");
  });

  it("uses only mutually known valuations in the comparable subtotal", () => {
    const knownA = position({ contract: CONTRACT_A, raw: "1", quantity: "1", value: "10" });
    const knownB = position({ contract: CONTRACT_A, raw: "1", quantity: "1", value: "12" });
    const unknownA = position({ contract: CONTRACT_B, raw: "2", quantity: "2", price: null, value: null });
    const unknownB = position({ contract: CONTRACT_B, raw: "2", quantity: "2", value: "20" });
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, positions: [knownA, unknownA] }), snapshotB: snapshot({ block: 2, positions: [knownB, unknownB] }) });
    expect(result.valueComparison).toMatchObject({
      comparablePositionCount: 1,
      excludedPositionCount: 1,
      indicativeValueUsdA: "10",
      indicativeValueUsdB: "12",
      signedIndicativeValueDeltaUsd: "2",
      status: "PARTIAL",
    });
  });

  it("keeps partial portfolio and incomplete integrity explicit", () => {
    const partial = position({ contract: CONTRACT_A, raw: "1", quantity: "1", integrityComplete: false });
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, status: "PARTIAL", positions: [partial] }), snapshotB: snapshot({ block: 2, status: "PARTIAL", positions: [partial] }) });
    expect(result.status).toBe("PARTIAL");
    expect(result.coverage.completeWalletComparison).toBe(false);
    expect(result.positions[0].evidence.status).toBe("PARTIAL");
  });

  it("reports same-block, reversed order, and unavailable timestamps without inventing an interval", () => {
    const item = position({ contract: CONTRACT_A, raw: "1", quantity: "1" });
    const same = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1, positions: [item] }), snapshotB: snapshot({ block: 1, generatedAt: "2026-09-23T00:00:02.000Z", positions: [item] }) });
    expect(same.order).toMatchObject({ status: "SAME_BLOCK", observedOnchainInterval: false });
    expect(same.changeSummary).toBe("SAME_BLOCK_NO_ONCHAIN_INTERVAL");
    expect(same.warnings).toContain("At least one block timestamp is unavailable and remains UNKNOWN.");

    const reversed = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 2, generatedAt: "2026-09-23T00:00:02.000Z", positions: [item] }), snapshotB: snapshot({ block: 1, generatedAt: "2026-09-23T00:00:01.000Z", positions: [item] }) });
    expect(reversed.order.status).toBe("REVERSED");
    expect(reversed.changeSummary).toBe("INVALID_SNAPSHOT_ORDER");
  });

  it("exposes a computation-only read-only boundary", () => {
    const result = buildPortfolioSnapshotComparison({ snapshotA: snapshot({ block: 1 }), snapshotB: snapshot({ block: 2 }) });
    expect(result.readOnly).toEqual({
      enabled: true,
      networkRequests: [],
      transactionMethods: [],
      quoteRequested: false,
      transactionBuilt: false,
      simulationRequested: false,
    });
  });
});
