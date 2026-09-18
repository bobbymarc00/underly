import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing ranking workload budget", () => {
  it("keeps HOT and movers independent", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      'type RankingScope = "hot" | "movers"',
    );
    expect(route).toContain('scope === "hot"');
    expect(route).toContain("getMoversSnapshot");
  });

  it("keeps mover candidate discovery bounded", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "MAX_MOVER_CANDIDATE_LIMIT = 24",
    );
    expect(route).toContain(
      "PRIMARY_CANDLE_CONCURRENCY = 8",
    );
    expect(route).toContain(
      "CANDLE_CONCURRENCY = 6",
    );
  });

  it("does primary discovery before selective consensus verification", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain("probePrimaryBatch");
    expect(route).toContain(
      "finalizePrimaryProbes",
    );
    expect(route).toContain(
      "selectVerificationProbes",
    );
  });

  it("uses five-minute cache and avoids expensive internal routes", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "CACHE_TTL_MS = 300_000",
    );
    expect(route).not.toContain('"/api/liquidity"');
    expect(route).not.toContain('"/api/market-history"');
  });
});
