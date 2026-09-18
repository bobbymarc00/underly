import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("stock terminal phase 2 intelligence", () => {
  it("mounts the Phase 2 evidence panels without restoring the chart", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");

    expect(terminal).toContain("StockIntelligencePanels");
    expect(terminal).not.toContain("WrapperChart");
    expect(terminal).not.toContain("/api/market-history");
  });

  it("loads liquidity and current/historical corporate actions from frozen read-only endpoints", () => {
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(panels).toContain("/api/liquidity?");
    expect(panels).toContain("/api/corporate-actions?");
    expect(panels).toContain("/api/corporate-actions/history?");
    expect(panels).toContain("notionalUsd=1000");
    expect(panels).toContain("<h2>Wrapper intelligence</h2>");
    expect(panels).toContain("no wrapper ranking is produced");
  });

  it("keeps firewall findings and proof on demand with HOLD intent only", () => {
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(panels).toContain('"/api/firewall/check"');
    expect(panels).toContain('intent: "HOLD"');
    expect(panels).toContain("GENERATE HOLD PROOF");
    expect(panels).toContain("No automatic firewall call");
    expect(panels).not.toContain('intent: "BUY"');
    expect(panels).not.toContain('intent: "SELL"');
    expect(panels).not.toContain('intent: "COLLATERAL"');
  });

  it("does not introduce wallet signing, approvals, or transaction execution", () => {
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(panels).not.toContain("privateKey");
    expect(panels).not.toContain("sendTransaction");
    expect(panels).not.toContain("signTransaction");
    expect(panels).not.toContain("approve(");
    expect(panels).toContain(
      "NO EXECUTION QUOTE · NO SIGNATURE · NO TRANSACTION",
    );
  });

  it("keeps historical corporate actions separate from current ActionGuard semantics", () => {
    const panels = file(
      "src/components/market/StockIntelligencePanels.tsx",
    );

    expect(panels).toContain("ACTIONGUARD");
    expect(panels).toContain("Historical evidence");
    expect(panels).toContain(
      "Historical events are informational evidence only.",
    );
    expect(panels).toContain(
      "Ordinary market-closed sessions remain CLEAR",
    );
  });

  it("adds responsive Phase 2 terminal styling", () => {
    const css = file("src/app/terminal.css");

    expect(css).toContain("UNDERLY_PHASE2_INTELLIGENCE");
    expect(css).toContain(".tm-intel-grid");
    expect(css).toContain(".tm-proof-wrapper-grid");
    expect(css).toContain(".tm-event-list");
  });
});
