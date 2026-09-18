import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("surface color consistency", () => {
  it("defines shared brand and semantic market colors", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain("UNDERLY_SURFACE_COLOR_CONSISTENCY");
    expect(css).toContain("--tm-brand: #d8ff45");
    expect(css).toContain("--tm-hot:");
    expect(css).toContain("--tm-gainer:");
    expect(css).toContain("--tm-loser:");
  });

  it("colors HOT / GAINERS / LOSERS tabs and tile surfaces", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain(".tm-market-tab-hot[data-active=\"true\"]");
    expect(css).toContain(".tm-market-tab-gainer[data-active=\"true\"]");
    expect(css).toContain(".tm-market-tab-loser[data-active=\"true\"]");
    expect(css).toContain(".tm-market-tab-tile-hot");
    expect(css).toContain(".tm-market-tab-tile-gainer");
    expect(css).toContain(".tm-market-tab-tile-loser");
  });

  it("exposes active market tone for the board heading", () => {
    const landing = file(
      "src/components/market/MarketLanding.tsx",
    );

    expect(landing).toContain(
      'className="tm-shell tm-market-tab-board" data-tone={tone}',
    );
  });

  it("adds brand color treatment to wallet and stock surfaces", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain(".tm-wallet-head h1");
    expect(css).toContain(".tm-wallet-form:focus-within");
    expect(css).toContain(".tm-stock-reference > strong");
    expect(css).toContain(".tm-intel-panel");
  });
});
