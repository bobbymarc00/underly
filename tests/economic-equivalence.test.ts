import { describe, expect, it } from "vitest";

import {
  buildCurrentEconomicSnapshot,
  tokenQuantityToUnderlyingShares,
  underlyingSharesToTokenQuantity,
} from "@/lib/underly/equivalence";

describe("current economic equivalence", () => {
  it("normalizes wrapper price by the verified current token/share ratio", () => {
    const snapshot = buildCurrentEconomicSnapshot({
      tokenPriceUsd: "202",
      referencePriceUsd: "200",
      tokenShareRatio: "1.01",
    });

    expect(snapshot.shareEquivalentPriceUsd).toBe("200");
    expect(snapshot.referenceGapPct).toBe("0");
  });

  it("detects a true ratio-adjusted reference dislocation", () => {
    const snapshot = buildCurrentEconomicSnapshot({
      tokenPriceUsd: "204.02",
      referencePriceUsd: "200",
      tokenShareRatio: "1.01",
    });

    expect(snapshot.shareEquivalentPriceUsd).toBe("202");
    expect(snapshot.referenceGapPct).toBe("1");
  });

  it("converts wrapper quantity to underlying-equivalent shares and back", () => {
    expect(
      tokenQuantityToUnderlyingShares({
        tokenQuantity: "2.5",
        tokenShareRatio: "1.01",
      }),
    ).toBe("2.525");

    expect(
      underlyingSharesToTokenQuantity({
        underlyingShares: "2.525",
        tokenShareRatio: "1.01",
      }),
    ).toBe("2.5");
  });

  it("does not assume a ratio when evidence is missing", () => {
    const snapshot = buildCurrentEconomicSnapshot({
      tokenPriceUsd: "200",
      referencePriceUsd: "200",
      tokenShareRatio: null,
    });

    expect(snapshot.shareEquivalentPriceUsd).toBeNull();
    expect(snapshot.referenceGapPct).toBeNull();
  });
});
