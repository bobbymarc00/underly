import { describe, expect, it } from "vitest";
import { buildValuation } from "../src/lib/underly/valuation";

describe("buildValuation", () => {
  it("uses the lowest available mark as conservative value", () => {
    const result = buildValuation({
      displayedValueUsd: "1000",
      tokenPriceUsd: "105",
      referencePriceUsd: "100",
      executableValueUsd: "970",
    });
    expect(result.referenceAdjustedValueUsd).toBe("952.380952380952380952381");
    expect(result.conservativeValueUsd).toBe("952.380952380952380952381");
  });
});

