import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing mover reference guard", () => {
  it("requires current wrapper close to stay near reference price", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "MAX_REFERENCE_DEVIATION_PCT = 15",
    );
    expect(route).toContain(
      "isReferencePriceConsistent",
    );
    expect(route).toContain(
      "sample.lastClose",
    );
    expect(route).toContain(
      "item.referencePriceUsd",
    );
  });

  it("preserves adaptive 12 to 24 sampling and consensus protection", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "INITIAL_MOVER_CANDIDATE_LIMIT = 12",
    );
    expect(route).toContain(
      "MAX_MOVER_CANDIDATE_LIMIT = 24",
    );
    expect(route).toContain(
      "resolveMoverConsensus",
    );
    expect(route).toContain(
      "CONSENSUS_MAX_SPREAD_PCT_POINTS = 5",
    );
  });

  it("does not reintroduce expensive landing fan-out routes", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).not.toContain('"/api/liquidity"');
    expect(route).not.toContain('"/api/market-history"');
  });
});
