import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("landing tabbed market mosaic", () => {
  it("defaults to HOT and exposes three market tabs", () => {
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

  it("loads HOT immediately but only fetches movers after a mover tab is opened", () => {
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).toContain(
      "activeTab === \"hot\" ||",
    );
    expect(landing).toContain(
      "/api/landing-rankings?scope=hot&limit=${TILE_LIMIT}",
    );
    expect(landing).toContain(
      "/api/landing-rankings?scope=movers&limit=${TILE_LIMIT}",
    );
    expect(landing).not.toContain("IntersectionObserver");
  });

  it("uses the old-style asymmetric large/small tile mosaic", () => {
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );
    const css = repoFile("src/app/terminal.css");

    expect(landing).toContain(
      "tm-market-tab-tile-featured",
    );
    expect(landing).toContain(
      "tm-market-tab-tile-wide",
    );
    expect(css).toContain(
      "UNDERLY_MARKET_TABBED_MOSAIC",
    );
    expect(css).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(css).toContain(
      ".tm-market-tab-tile-featured",
    );
  });

  it("keeps category tones and mover evidence", () => {
    const landing = repoFile(
      "src/components/market/MarketLanding.tsx",
    );
    const css = repoFile("src/app/terminal.css");

    expect(landing).toContain("CONSENSUS");
    expect(landing).toContain("SINGLE SOURCE");
    expect(css).toContain(
      ".tm-market-tab-tile-gainer",
    );
    expect(css).toContain(
      ".tm-market-tab-tile-loser",
    );
    expect(css).toContain(
      ".tm-market-tab-tile-hot",
    );
  });
});
