import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("evidence semantics follow-up", () => {
  it("shows normalized wrapper dividend yield while preserving raw evidence", () => {
    const company = file("src/app/api/company/route.ts");
    const stock = file(
      "src/components/market/StockTerminal.tsx",
    );

    expect(company).toContain("dividendYieldPercent");
    expect(company).toContain("normalizeDividendYield");
    expect(stock).toContain("DIVIDEND YIELD · NORMALIZED");
    expect(stock).toContain("raw ");
  });

  it("uses numeric canonicalization for fundamental agreement only", () => {
    const company = file("src/app/api/company/route.ts");

    expect(company).toContain("canonicalNumericEvidence");
    expect(company).toContain("resolveField(evidence, true)");
  });

  it("labels wrapper availability separately from market-session detail", () => {
    const stock = file(
      "src/components/market/StockTerminal.tsx",
    );

    expect(stock).toContain('if (value === true) return "AVAILABLE"');
    expect(stock).toContain("TRADING ACCESS");
  });

  it("describes normalized dividend yield as provider-reported evidence", () => {
    const intel = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(intel).toMatch(
      /Provider yield\s*[·\u00b7]\s*normalized/,
    );
    expect(intel).toContain(
      "Dividend yield is provider-reported evidence normalized only",
    );
    expect(intel).toContain("annualized by Underly");
  });

  it("sanitizes historical source failures for the UI", () => {
    const history = file(
      "src/app/api/corporate-actions/history/route.ts",
    );

    expect(history).toContain(
      "Historical corporate-action source temporarily unavailable",
    );
    expect(history).not.toContain("note: configured.reason");
  });

  it("gives news unavailable state proper block spacing", () => {
    const css = file(
      "src/components/news/NewsDock.module.css",
    );

    expect(css).toContain(
      "UNDERLY_NEWS_UNAVAILABLE_SPACING",
    );
    expect(css).toContain("display: grid");
  });
});
