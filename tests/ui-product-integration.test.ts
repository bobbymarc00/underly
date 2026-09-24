import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Underly v1.0-A product integration", () => {
  it("exposes the stock workflow as real links to every downstream surface", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).toContain('aria-label="Stock workflow"');
    expect(terminal).toContain('href="/#dislocations"');
    expect(terminal).toContain('href="#asset-graph"');
    expect(terminal).toContain('href="#market-intelligence"');
    expect(terminal).toContain('href="/wallet"');
    expect(terminal).toContain('href="#continuity"');
    expect(terminal).toContain('href="#preflight"');
    expect(terminal).toContain('href="#readiness"');
    expect(terminal).not.toContain("onClick={() => {}}");
  });

  it("provides matching, named section targets", () => {
    expect(file("src/components/market/DislocationRadar.tsx")).toContain(
      'id="dislocations"',
    );
    expect(file("src/components/market/StockTerminal.tsx")).toContain(
      'id="asset-graph"',
    );
    expect(file("src/components/market/StockIntelligencePanels.tsx")).toContain(
      'id="market-intelligence"',
    );
    expect(file("src/components/market/ContinuityPanel.tsx")).toContain(
      'id="continuity"',
    );
    expect(file("src/components/market/PreflightPanel.tsx")).toContain(
      'id="preflight"',
    );
    expect(file("src/components/market/ExecutionReadinessPanel.tsx")).toContain(
      'id="readiness"',
    );
  });

  it("keeps transaction-capable actions explicit and read-only", () => {
    const continuity = file("src/components/market/ContinuityPanel.tsx");
    const preflight = file("src/components/market/PreflightPanel.tsx");
    const readiness = file("src/components/market/ExecutionReadinessPanel.tsx");

    expect(continuity).toContain('type="submit"');
    expect(preflight).toContain('type="submit"');
    expect(readiness).toContain('type="submit"');
    expect(`${continuity}${preflight}${readiness}`).not.toContain(
      "eth_sendRawTransaction",
    );
  });

  it("deduplicates related-news ticker links before rendering keys", () => {
    const news = file("src/components/news/NewsDock.tsx");

    expect(news).toContain("function uniqueTickerEvidence");
    expect(news).toContain("seen.has(ticker)");
    expect(news).toContain("uniqueTickerEvidence(item.relatedTickers)");
  });

  it("deduplicates search underlyings while retaining exact wrapper identities", () => {
    const search = file("src/components/market/TickerSearch.tsx");

    expect(search).toContain("function uniqueSearchItems");
    expect(search).toContain("byTicker.get(ticker)");
    expect(search).toContain("wrapper.contractAddress.toLowerCase()");
    expect(search).toContain("setItems(uniqueSearchItems");
  });

  it("loads one shared asset graph for continuity and readiness", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");
    const continuity = file("src/components/market/ContinuityPanel.tsx");
    const readiness = file(
      "src/components/market/ExecutionReadinessPanel.tsx",
    );

    expect(terminal.match(/\/api\/asset-graph\?ticker=/g)).toHaveLength(1);
    expect(terminal).toContain("discovery={wrapperDiscovery}");
    expect(continuity).not.toContain("/api/asset-graph?ticker=");
    expect(readiness).not.toContain("/api/asset-graph?ticker=");
    expect(terminal).toContain("controller.signal.aborted");
    expect(terminal).toContain("assetGraph?.ticker === ticker");
  });
});
