import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const UI_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const MOJIBAKE = /(?:\uFEFF|Â|Ã|â(?:†|€|ˆ)|ï»¿|�)/u;

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function sourceFiles(root: string): string[] {
  return readdirSync(join(process.cwd(), root), { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    })
    .filter((path) => UI_EXTENSIONS.has(extname(path)));
}

describe("Underly UI UTF-8 encoding regression", () => {
  it("contains no known mojibake markers across UI presentation sources", () => {
    const files = [
      ...sourceFiles("src/components"),
      ...sourceFiles("src/lib/ui"),
      "src/app/globals.css",
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "src/app/terminal.css",
    ];
    const affected = files.filter((path) => MOJIBAKE.test(source(path)));

    expect(affected).toEqual([]);
  });

  it("keeps landing ticker separators, labels, arrows, and punctuation intact", () => {
    const landing = source("src/components/market/MarketLanding.tsx");

    expect(landing).toContain('.map((item) => item.ticker)');
    expect(landing).toContain('.join(" · ")');
    expect(landing).toContain("Coverage signals only · not price momentum");
    expect(landing).toContain("<em>OPEN ↗</em>");
    expect(landing).toContain("OPEN V0.1 INSPECTOR ↗");
    expect(landing).toContain('return "—";');
    expect(landing).toContain('"24H −"');
    expect(landing).toContain("LOADING HOT MARKET SIGNALS…");
    expect(landing).toContain("CONSENSUS · ${item.moverEvidence.wrapperSamples}");
  });

  it("keeps the same Unicode vocabulary in adjacent landing components", () => {
    const radar = source("src/components/market/DislocationRadar.tsx");
    const header = source("src/components/market/TerminalHeader.tsx");
    const formatter = source("src/lib/ui/format.ts");

    expect(radar).toContain("OPEN ↗");
    expect(radar).toContain('return "—";');
    expect(header).toContain("BNB · READ ONLY");
    expect(formatter).toContain("…${value.slice(-8)}");
  });
});
