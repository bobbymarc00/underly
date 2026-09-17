import { describe, expect, it } from "vitest";
import { buildExecutionLegBreakdown } from "../src/lib/underly/execution";

describe("buildExecutionLegBreakdown", () => {
  it("measures friction against an explicit benchmark", () => {
    const leg = buildExecutionLegBreakdown("REQUESTED_NOTIONAL", "1000", "975");
    expect(leg.benchmarkValueUsd).toBe("1000");
    expect(leg.quotedValueUsd).toBe("975");
    expect(leg.frictionUsd).toBe("25");
    expect(leg.frictionPct).toBe("2.5");
    expect(leg.favorableQuotedDeltaUsd).toBeNull();
  });

  it("does not represent a favorable quote as negative friction", () => {
    const leg = buildExecutionLegBreakdown("REQUESTED_POSITION_NOTIONAL", "1000", "1000.5");
    expect(leg.frictionUsd).toBe("0");
    expect(leg.frictionPct).toBe("0");
    expect(leg.favorableQuotedDeltaUsd).toBe("0.5");
  });
});

