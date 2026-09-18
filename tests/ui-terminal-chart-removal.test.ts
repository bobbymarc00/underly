import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("stock chart removal", () => {
  it("does not request historical market data from the primary stock UI", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).not.toContain("/api/market-history");
    expect(terminal).not.toContain("MarketHistoryPayload");
    expect(terminal).not.toContain("HistoryMode");
    expect(terminal).not.toContain("WrapperChart");
  });

  it("preserves the historical market-data backend capability", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/api/market-history/route.ts")),
    ).toBe(true);

    const route = file("src/app/api/market-history/route.ts");
    expect(route).toContain("RAW_TOKEN_PRICE");
    expect(route).toContain("INDEXED_100");
  });

  it("keeps wrapper comparison and fundamentals as primary stock content", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).toContain("Same underlying, separate evidence");
    expect(terminal).toContain("Underlying profile");
    expect(terminal).toContain("Resolved evidence");
  });
});
