import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("v0.3 dislocation radar UI", () => {
  it("mounts the radar on the market landing without replacing frozen rankings", () => {
    const landing = repoFile("src/components/market/MarketLanding.tsx");

    expect(landing).toContain('import { DislocationRadar } from "./DislocationRadar";');
    expect(landing).toContain("<DislocationRadar />");
    expect(landing).toContain("/api/landing-rankings?scope=hot");
  });

  it("loads current BSC dislocations and explains ratio normalization", () => {
    const radar = repoFile("src/components/market/DislocationRadar.tsx");

    expect(radar).toContain('/api/dislocations?session=all&limit=6');
    expect(radar).toContain("CURRENT SNAPSHOT ONLY");
    expect(radar).toContain("token/share ratio");
    expect(radar).not.toContain("BUY NOW");
    expect(radar).not.toContain("PROFIT");
  });
});
