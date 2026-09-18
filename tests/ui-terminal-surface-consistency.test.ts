import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("terminal surface consistency polish", () => {
  it("tightens the landing gap immediately below the sticky header", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain("UNDERLY_SURFACE_CONSISTENCY_POLISH");
    expect(css).toContain(".tm-market-intro");
    expect(css).toContain("padding-top: 42px");
    expect(css).toContain(".tm-market-intro-grid");
    expect(css).toContain("margin-top: 14px");
  });

  it("uses the same tighter vertical rhythm on wallet and inspector", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain(".tm-wallet-head");
    expect(css).toContain("padding-top: 44px");
    expect(css).toContain(".tm-legacy-shell .hero");
    expect(css).toContain("min-height: 405px");
    expect(css).toContain("padding-top: 42px");
  });

  it("removes obsolete primary-chart copy from the landing boundary", () => {
    const landing = file(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).toContain(
      "Market-history evidence remains available through the read-only API.",
    );
    expect(landing).toContain(
      "Stock detail prioritizes wrapper intelligence",
    );
    expect(landing).not.toContain(
      "Historical share-adjusted charts remain disabled",
    );
  });

  it("does not add transaction or signing paths", () => {
    const landing = file(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).not.toContain("sendTransaction");
    expect(landing).not.toContain("signTransaction");
    expect(landing).not.toContain("privateKey");
  });
});
