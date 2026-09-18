import { describe, expect, it } from "vitest";

import { buildContinuityMetrics } from "../src/lib/underly/continuity";

describe("Underly v0.5 continuity metrics", () => {
  it("normalizes different wrapper ratios into the same underlying exposure", () => {
    const result = buildContinuityMetrics({
      sourceTokenAmount: "1",
      sourceTokenShareRatio: "0.01",
      targetTokenAmount: "10",
      targetTokenShareRatio: "0.001",
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.sourceUnderlyingShares).toBe("0.01");
    expect(result.targetUnderlyingShares).toBe("0.01");
    expect(result.parityTargetTokenAmount).toBe("10");
    expect(result.underlyingRetentionPct).toBe("100");
    expect(result.underlyingDeltaPct).toBe("0");
  });

  it("measures exposure loss without inventing an investment threshold", () => {
    const result = buildContinuityMetrics({
      sourceTokenAmount: "1",
      sourceTokenShareRatio: "0.01",
      targetTokenAmount: "9.8",
      targetTokenShareRatio: "0.001",
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.parityTargetTokenAmount).toBe("10");
    expect(result.underlyingRetentionPct).toBe("98");
    expect(result.underlyingDeltaPct).toBe("-2");
  });

  it("preserves positive continuity deltas instead of capping them at 100 percent", () => {
    const result = buildContinuityMetrics({
      sourceTokenAmount: "1",
      sourceTokenShareRatio: "0.01",
      targetTokenAmount: "10.2",
      targetTokenShareRatio: "0.001",
    });

    expect(result.status).toBe("AVAILABLE");
    expect(result.underlyingRetentionPct).toBe("102");
    expect(result.underlyingDeltaPct).toBe("2");
  });

  it("fails closed when the source ratio is unavailable", () => {
    const result = buildContinuityMetrics({
      sourceTokenAmount: "1",
      sourceTokenShareRatio: null,
      targetTokenAmount: "10",
      targetTokenShareRatio: "0.001",
    });

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.underlyingRetentionPct).toBeNull();
    expect(result.underlyingDeltaPct).toBeNull();
  });

  it("rejects zero source exposure as an unusable continuity baseline", () => {
    const result = buildContinuityMetrics({
      sourceTokenAmount: "0",
      sourceTokenShareRatio: "0.01",
      targetTokenAmount: "10",
      targetTokenShareRatio: "0.001",
    });

    expect(result.status).toBe("UNAVAILABLE");
  });
});