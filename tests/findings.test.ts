import { describe, expect, it } from "vitest";
import { buildFindings } from "../src/lib/underly/findings";
import type { ExecutionResult } from "../src/lib/underly/execution";

function execution(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    benchmarkNotionalUsd: "1000",
    methodology: "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE",
    quantitySource: "SYNTHETIC_ENTRY_OUTPUT",
    tokenAmount: "4.5",
    entry: { attempted: true, available: true, vendor: "LiquidMesh", errorCode: null, errorMessage: null },
    exit: { attempted: true, available: true, vendor: "LiquidMesh", errorCode: null, errorMessage: null },
    breakdown: {
      entry: {
        benchmark: "REQUESTED_NOTIONAL",
        benchmarkValueUsd: "1000",
        quotedValueUsd: "980",
        frictionUsd: "20",
        frictionPct: "2",
        favorableQuotedDeltaUsd: null,
      },
      exit: {
        benchmark: "RWA_TOKEN_PRICE_MARK",
        benchmarkValueUsd: "980",
        quotedValueUsd: "964.85",
        frictionUsd: "15.15",
        frictionPct: "1.54591836734693878",
        favorableQuotedDeltaUsd: null,
      },
      roundTrip: {
        benchmark: "REQUESTED_NOTIONAL",
        benchmarkValueUsd: "1000",
        quotedValueUsd: "964.85",
        frictionUsd: "35.15",
        frictionPct: "3.515",
        favorableQuotedDeltaUsd: null,
      },
    },
    executableValueUsd: "964.85",
    currentHaircutUsd: "35.15",
    currentHaircutPct: "3.515",
    favorableQuotedDeltaUsd: null,
    quoteTimestamp: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("buildFindings", () => {
  it("flags reference divergence and high execution friction for BUY", () => {
    const findings = buildFindings({
      intent: "BUY",
      referenceGapPct: "3.48",
      referenceUpstreamCode: 0,
      marketOpen: true,
      tokenShareRatioKnown: true,
      attestationDaily: "AVAILABLE",
      passportPartial: false,
      execution: execution(),
    });
    expect(findings.map((f) => f.code)).toContain("REFERENCE_DIVERGENCE");
    expect(findings.map((f) => f.code)).toContain("HIGH_EXECUTION_FRICTION");
  });

  it("reports upstream rate limiting instead of generic missing reference", () => {
    const findings = buildFindings({
      intent: "BUY",
      referenceGapPct: null,
      referenceUpstreamCode: 42900,
      marketOpen: true,
      tokenShareRatioKnown: true,
      attestationDaily: "AVAILABLE",
      passportPartial: false,
      execution: execution({ currentHaircutPct: "0.1" }),
    });
    expect(findings.map((f) => f.code)).toContain("UPSTREAM_RATE_LIMITED");
    expect(findings.map((f) => f.code)).not.toContain("REFERENCE_UNAVAILABLE");
  });

  it("does not invent entry/exit findings for HOLD", () => {
    const findings = buildFindings({
      intent: "HOLD",
      referenceGapPct: "0.1",
      referenceUpstreamCode: 0,
      marketOpen: true,
      tokenShareRatioKnown: true,
      attestationDaily: "AVAILABLE",
      passportPartial: false,
      execution: execution({
        methodology: "NOT_APPLICABLE",
        quantitySource: null,
        tokenAmount: null,
        entry: { attempted: false, available: null, vendor: null, errorCode: null, errorMessage: null },
        exit: { attempted: false, available: null, vendor: null, errorCode: null, errorMessage: null },
        executableValueUsd: null,
        currentHaircutUsd: null,
        currentHaircutPct: null,
      }),
    });
    expect(findings.map((f) => f.code)).not.toContain("NO_ENTRY_ROUTE");
    expect(findings.map((f) => f.code)).not.toContain("NO_EXIT_ROUTE");
    expect(findings.map((f) => f.code)).not.toContain("HIGH_EXECUTION_FRICTION");
  });

  it("uses exit semantics for SELL", () => {
    const findings = buildFindings({
      intent: "SELL",
      referenceGapPct: "0.1",
      referenceUpstreamCode: 0,
      marketOpen: true,
      tokenShareRatioKnown: true,
      attestationDaily: "AVAILABLE",
      passportPartial: false,
      execution: execution({
        methodology: "CURRENT_DIRECT_EXIT_QUOTE",
        quantitySource: "DERIVED_FROM_TOKEN_PRICE",
        entry: { attempted: false, available: null, vendor: null, errorCode: null, errorMessage: null },
        exit: { attempted: true, available: false, vendor: null, errorCode: 40374, errorMessage: "Insufficient liquidity" },
        executableValueUsd: null,
        currentHaircutUsd: null,
        currentHaircutPct: null,
      }),
    });
    expect(findings.map((f) => f.code)).toContain("INSUFFICIENT_LIQUIDITY");
    expect(findings.map((f) => f.code)).not.toContain("NO_ENTRY_ROUTE");
  });

  it("deduplicates NON_TRADING_SESSION", () => {
    const findings = buildFindings({
      intent: "BUY",
      referenceGapPct: "0",
      referenceUpstreamCode: 0,
      marketOpen: false,
      tokenShareRatioKnown: true,
      attestationDaily: "AVAILABLE",
      passportPartial: false,
      execution: execution({
        entry: { attempted: true, available: false, vendor: null, errorCode: 40367, errorMessage: "Non-trading session" },
        exit: { attempted: false, available: null, vendor: null, errorCode: null, errorMessage: null },
        executableValueUsd: null,
        currentHaircutUsd: null,
        currentHaircutPct: null,
      }),
    });
    expect(findings.filter((f) => f.code === "NON_TRADING_SESSION")).toHaveLength(1);
    expect(findings.find((f) => f.code === "NON_TRADING_SESSION")?.severity).toBe("critical");
  });
});

