import { describe, expect, it } from "vitest";

import {
  resolveMoverConsensus,
} from "../src/lib/underly/landing-ranking";

describe("landing mover consensus", () => {
  it("rejects the observed AMD cross-wrapper disagreement", () => {
    const result = resolveMoverConsensus(
      2,
      [
        { provider: "bstock", changePct: 5.7708853448 },
        { provider: "ondo", changePct: -89.2535777701 },
      ],
      5,
    );

    expect(result.status).toBe("REJECTED");
    expect(result.changePct).toBeNull();
  });

  it("rejects the observed SNDK cross-wrapper disagreement", () => {
    const result = resolveMoverConsensus(
      2,
      [
        { provider: "bstock", changePct: 6.6445676950 },
        { provider: "ondo", changePct: -60.8691645444 },
      ],
      5,
    );

    expect(result.status).toBe("REJECTED");
    expect(result.changePct).toBeNull();
  });

  it("accepts aligned multi-wrapper moves using the median return", () => {
    const result = resolveMoverConsensus(
      2,
      [
        { provider: "bstock", changePct: 2.1 },
        { provider: "ondo", changePct: 2.6 },
      ],
      5,
    );

    expect(result.status).toBe("CONSENSUS");
    expect(result.changePct).toBeCloseTo(2.35);
    expect(result.wrapperSamples).toBe(2);
    expect(result.spreadPctPoints).toBeCloseTo(0.5);
  });

  it("allows an actual single-wrapper underlying but labels it", () => {
    const result = resolveMoverConsensus(
      1,
      [{ provider: "only", changePct: -3.25 }],
      5,
    );

    expect(result.status).toBe("SINGLE_SOURCE");
    expect(result.changePct).toBe(-3.25);
  });

  it("rejects a multi-wrapper underlying when only one wrapper has usable history", () => {
    const result = resolveMoverConsensus(
      2,
      [{ provider: "bstock", changePct: 3.1 }],
      5,
    );

    expect(result.status).toBe("REJECTED");
    expect(result.changePct).toBeNull();
  });
});
