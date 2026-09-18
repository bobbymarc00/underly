import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("market-history chunking boundary", () => {
  it("caps upstream calls at 299 candles", () => {
    const route = repoFile("src/app/api/market-history/route.ts");
    expect(route).toContain("const UPSTREAM_CANDLE_LIMIT = 299");
    expect(route).toContain("Math.min(limit, UPSTREAM_CANDLE_LIMIT)");
  });

  it("chunks long explicit ranges and deduplicates boundaries", () => {
    const route = repoFile("src/app/api/market-history/route.ts");
    expect(route).toContain("function requestWindows");
    expect(route).toContain("while (cursor < end)");
    expect(route).toContain("function dedupeCandles");
    expect(route).toContain("envelopes");
  });

  it("retains requested-window enforcement after chunking", () => {
    const route = repoFile("src/app/api/market-history/route.ts");
    expect(route).toContain("withinRequestedRange(item, start, end)");
  });

  it("does not reference a removed singular envelope in the successful merged return", () => {
    const route = repoFile("src/app/api/market-history/route.ts");

    expect(route).toContain("upstreamCode: 0");
    expect(route).toContain("upstreamMessage: envelopes[0]?.msg ?? null");
    expect(route).not.toContain("upstreamCode: envelope.code");
    expect(route).not.toContain("upstreamMessage: envelope.msg");
  });
});
