import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing ranking dashboard", () => {
  it("uses HOT / GAINERS / LOSERS tabs with HOT as default", () => {
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).toContain(
      'useState<RankingTab>("hot")',
    );
    expect(landing).toContain(
      '(["hot", "gainers", "losers"] as RankingTab[])',
    );
    expect(landing).toContain('role="tablist"');
    expect(landing).toContain('role="tab"');
  });

  it("loads HOT immediately and movers only after opening a mover tab", () => {
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).toContain(
      "/api/landing-rankings?scope=hot&limit=${TILE_LIMIT}",
    );
    expect(landing).toContain(
      'activeTab === "hot" ||',
    );
    expect(landing).toContain(
      "/api/landing-rankings?scope=movers&limit=${TILE_LIMIT}",
    );
    expect(landing).not.toContain("IntersectionObserver");
  });

  it("keeps cross-wrapper mover consensus", () => {
    const route = repoFile(
      "src/app/api/landing-rankings/route.ts",
    );

    expect(route).toContain("resolveMoverConsensus");
    expect(route).toContain("MAX_WRAPPERS_PER_MOVER = 2");
    expect(route).toContain(
      "CONSENSUS_MAX_SPREAD_PCT_POINTS = 5",
    );
    expect(route).not.toContain('"/api/liquidity"');
    expect(route).not.toContain('"/api/market-history"');
  });

  it("uses underlying reference price instead of wrapper candle price", () => {
    const route = repoFile(
      "src/app/api/landing-rankings/route.ts",
    );
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );

    expect(route).toContain("referencePriceUsd");
    expect(route).toContain("asset.referencePrice");
    expect(landing).toContain("REFERENCE PRICE");
    expect(landing).toContain("CONSENSUS");
  });
});
