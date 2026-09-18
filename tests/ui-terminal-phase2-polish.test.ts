import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Phase 2 UI polish", () => {
  it("places company/fundamentals before wrapper intelligence", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    const overview = terminal.indexOf("tm-overview-grid");
    const intelligence = terminal.indexOf("<StockIntelligencePanels");

    expect(overview).toBeGreaterThan(-1);
    expect(intelligence).toBeGreaterThan(-1);
    expect(overview).toBeLessThan(intelligence);
  });

  it("uses a compact wrapper-intelligence heading without ranking copy as the title", () => {
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(panels).toContain("<h2>Wrapper intelligence</h2>");
    expect(panels).toContain("no wrapper ranking is produced");
    expect(panels).not.toContain("<h2>Current evidence, not a ranking</h2>");
  });

  it("keeps the primary stock surface chart-free", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(terminal).not.toContain("WrapperChart");
    expect(terminal).not.toContain("/api/market-history");
    expect(panels).not.toContain("/api/market-history");
  });

  it("adds a dedicated compact Phase 2 polish layer", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain("UNDERLY_PHASE2_POLISH");
    expect(css).toContain(".tm-intel .tm-section-head h2");
    expect(css).toContain("font-size: clamp(24px, 2.6vw, 38px)");
    expect(css).toContain(".tm-intel-panel");
  });
});
