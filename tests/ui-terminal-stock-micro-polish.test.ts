import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("stock detail micro polish", () => {
  it("does not render a large fallback paragraph when company description is absent", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).toContain("description &&");
    expect(terminal).not.toContain(
      "Company description is unavailable in the current evidence.",
    );
  });

  it("keeps chart-free and evidence-first stock structure", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).toContain("<StockIntelligencePanels ticker={ticker} />");
    expect(terminal).not.toContain("WrapperChart");
    expect(terminal).not.toContain("/api/market-history");
  });

  it("adds compact hero, wrapper, and overview density rules", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain("UNDERLY_STOCK_MICRO_POLISH");
    expect(css).toContain(".tm-stock-head");
    expect(css).toContain("padding-top: 26px");
    expect(css).toContain(".tm-wrapper-row");
    expect(css).toContain("min-height: 68px");
    expect(css).toContain(".tm-overview-grid");
    expect(css).toContain("padding-bottom: 30px");
  });
});
