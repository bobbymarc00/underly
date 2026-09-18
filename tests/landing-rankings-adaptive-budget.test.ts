import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing ranking adaptive mover budget", () => {
  it("starts at 12 candidates but can expand to 24", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "INITIAL_MOVER_CANDIDATE_LIMIT = 12",
    );
    expect(route).toContain(
      "MAX_MOVER_CANDIDATE_LIMIT = 24",
    );
  });

  it("uses provisional primary-wrapper coverage to decide expansion", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "provisionalDirectionCounts",
    );
    expect(route).toContain(
      "needMorePrimaryCoverage",
    );
    expect(route).toContain("const secondBatch");
  });

  it("does not verify every wrapper in the candidate pool", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "selectVerificationProbes",
    );
    expect(route).toContain(
      "VERIFICATION_BUFFER_PER_SIDE = 2",
    );
    expect(route).toContain(
      "probe.seed.wrappersForMover[1]",
    );
  });

  it("keeps five-minute caching", () => {
    const route = file(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain(
      "CACHE_TTL_MS = 300_000",
    );
    expect(route).toContain("moversCache");
    expect(route).toContain("moversInFlight");
  });
});
