import { describe, expect, it } from "vitest";

import { normalizeDividendYield } from "@/lib/underly/dividend";

describe("dividend-yield provider normalization", () => {
  it("keeps Ondo percentage-point values unchanged", () => {
    expect(normalizeDividendYield("ondo", "2.7")).toEqual({
      rawValue: "2.7",
      normalizedPercent: "2.7",
      convention: "PERCENTAGE_POINTS",
      normalizationStatus: "VERIFIED_PROVIDER_CONVENTION",
    });
  });

  it("converts bStocks unit fractions to percentage points", () => {
    expect(
      normalizeDividendYield("bstock", "0.0282"),
    ).toEqual({
      rawValue: "0.0282",
      normalizedPercent: "2.82",
      convention: "UNIT_FRACTION",
      normalizationStatus: "VERIFIED_PROVIDER_CONVENTION",
    });
  });

  it("preserves zero correctly", () => {
    expect(
      normalizeDividendYield("bstock", "0.00000000"),
    ).toMatchObject({
      rawValue: "0",
      normalizedPercent: "0",
      convention: "UNIT_FRACTION",
    });
  });

  it("does not guess a convention for a future provider", () => {
    expect(
      normalizeDividendYield("provider-x", "0.12"),
    ).toEqual({
      rawValue: "0.12",
      normalizedPercent: null,
      convention: "UNKNOWN",
      normalizationStatus: "UNKNOWN_PROVIDER_CONVENTION",
    });
  });

  it("preserves missing evidence", () => {
    expect(
      normalizeDividendYield("ondo", null),
    ).toEqual({
      rawValue: null,
      normalizedPercent: null,
      convention: "UNKNOWN",
      normalizationStatus: "MISSING",
    });
  });
});
