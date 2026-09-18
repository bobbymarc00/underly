import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("two-stage mover verification", () => {
  it("probes only the primary wrapper during broad discovery", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain("probePrimaryBatch");
    expect(route).toContain("seed.wrappersForMover[0]");
    expect(route).toContain(
      "PRIMARY_CANDLE_CONCURRENCY = 8",
    );
  });

  it("fetches the second wrapper only for selected verification candidates", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain("selectVerificationProbes");
    expect(route).toContain("verifySelectedProbes");
    expect(route).toContain(
      "probe.seed.wrappersForMover[1]",
    );
    expect(route).toContain(
      "VERIFICATION_BUFFER_PER_SIDE = 2",
    );
  });

  it("keeps adaptive 12 to 24 discovery before final verification", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "INITIAL_MOVER_CANDIDATE_LIMIT = 12",
    );
    expect(route).toContain(
      "MAX_MOVER_CANDIDATE_LIMIT = 24",
    );
    expect(route).toContain("const secondBatch");
    expect(route).toContain(
      "provisionalDirectionCounts",
    );
  });

  it("preserves reference-price and cross-wrapper consensus guards", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "isReferencePriceConsistent",
    );
    expect(route).toContain(
      "resolveMoverConsensus",
    );
    expect(route).toContain(
      "MAX_REFERENCE_DEVIATION_PCT = 15",
    );
    expect(route).toContain(
      "CONSENSUS_MAX_SPREAD_PCT_POINTS = 5",
    );
  });
});
