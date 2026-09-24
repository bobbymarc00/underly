import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("stock detail semantic cleanup", () => {
  it("uses underlying profile language and hides CEO for fund-like assets", () => {
    const stock = file(
      "src/components/market/StockTerminal.tsx",
    );

    expect(stock).toContain("Underlying profile");
    expect(stock).toContain("fundLikeIndustry");
    expect(stock).toContain('isFundLike ? "Asset type" : "Industry"');
    expect(stock).toContain("Corporate-officer fields are not");
  });

  it("explains conflict and unknown fundamentals without inventing values", () => {
    const stock = file(
      "src/components/market/StockTerminal.tsx",
    );

    expect(stock).toContain("fieldEvidenceNote");
    expect(stock).toContain("Provider values disagree");
    expect(stock).toContain("No usable provider value");
    expect(stock).toContain("NO CONSENSUS");
    expect(stock).toContain("One usable provider source");
    expect(stock).toContain("providerLabel(source.provider)");
    expect(stock).toContain("resolved.evidence");
  });

  it("never renders raw news provider error text in the dock", () => {
    const dock = file(
      "src/components/news/NewsDock.tsx",
    );

    expect(dock).toContain("unavailableCopy");
    expect(dock).toContain("Market news temporarily unavailable");
    expect(dock).not.toContain("payload.error");
    expect(dock).not.toContain("Alpha Vantage news unavailable");
  });

  it("sanitizes news failures in the server route", () => {
    const route = file("src/app/api/news/route.ts");

    expect(route).toContain("classifyNewsProviderFailure");
    expect(route).toContain("reasonCode: failure.reasonCode");
    expect(route).toContain("message: failure.publicMessage");
    expect(route).not.toContain("? error.message");
  });
});
