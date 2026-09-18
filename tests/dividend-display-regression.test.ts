import { describe, expect, it } from "vitest";

import {
  normalizeDividendYield,
} from "@/lib/underly/dividend";

describe("NVDA dividend-yield display regression", () => {
  it("normalizes bStocks unit fraction 0.0013 to 0.13 percentage points", () => {
    expect(
      normalizeDividendYield("bstock", "0.00130000"),
    ).toMatchObject({
      rawValue: "0.0013",
      normalizedPercent: "0.13",
      convention: "UNIT_FRACTION",
    });
  });

  it("keeps Ondo 0.13 percentage points as 0.13", () => {
    expect(
      normalizeDividendYield("ondo", "0.13"),
    ).toMatchObject({
      rawValue: "0.13",
      normalizedPercent: "0.13",
      convention: "PERCENTAGE_POINTS",
    });
  });
});
