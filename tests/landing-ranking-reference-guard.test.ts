import {
  isReferencePriceConsistent,
  referencePriceDeviationPct,
} from "../src/lib/underly/landing-ranking";
import { describe, expect, it } from "vitest";

describe("mover reference-price sanity", () => {
  it("rejects the observed DELL single-source candle outlier", () => {
    const lastClose = 132.1263475252429;
    const referencePrice = 597;

    expect(
      referencePriceDeviationPct(lastClose, referencePrice),
    ).toBeGreaterThan(70);

    expect(
      isReferencePriceConsistent(
        lastClose,
        referencePrice,
        15,
      ),
    ).toBe(false);
  });

  it("accepts the observed AMZN current candle near reference price", () => {
    const lastClose = 251.71194653400073;
    const referencePrice = 252;

    expect(
      referencePriceDeviationPct(lastClose, referencePrice),
    ).toBeLessThan(1);

    expect(
      isReferencePriceConsistent(
        lastClose,
        referencePrice,
        15,
      ),
    ).toBe(true);
  });

  it("rejects extreme wrapper/reference divergence generically", () => {
    expect(
      isReferencePriceConsistent(55.42, 552, 15),
    ).toBe(false);
  });

  it("allows ordinary market/reference drift", () => {
    expect(
      isReferencePriceConsistent(103, 100, 15),
    ).toBe(true);
  });
});
