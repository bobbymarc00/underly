import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("final terminal UI phase 1", () => {
  it("keeps NewsDock page-scoped instead of globally mounted", () => {
    const layout = repoFile("src/app/layout.tsx");
    const home = repoFile("src/app/page.tsx");
    const stock = repoFile("src/app/stock/[ticker]/page.tsx");

    expect(layout).not.toContain("NewsDock");
    expect(layout).toContain('"./terminal.css"');
    expect(layout).not.toMatch(/â|Ã|Â|ï»¿/);
    expect(home).toContain("<NewsDock");
    expect(stock).toContain("<NewsDock");
  });

  it("keeps the primary stock terminal chart-free", () => {
    const terminal = repoFile(
      "src/components/market/StockTerminal.tsx",
    );

    expect(terminal).not.toContain("WrapperChart");
    expect(terminal).not.toContain("/api/market-history");
    expect(terminal).not.toContain("INDEXED 100");
    expect(terminal).not.toContain("Chart range");
  });

  it("keeps the stock terminal on read-only company evidence", () => {
    const terminal = repoFile(
      "src/components/market/StockTerminal.tsx",
    );

    expect(terminal).toContain("/api/company");
    expect(terminal).not.toContain("/api/firewall/check");
    expect(terminal).not.toContain("sendTransaction");
    expect(terminal).not.toContain("signTransaction");
  });

  it("keeps the frozen v0.1 inspector reachable as a specialist route", () => {
    const inspector = repoFile("src/app/inspect/page.tsx");

    expect(inspector).toContain("/api/firewall/check");
    expect(inspector).toContain("FROZEN V0.1 INSPECTOR");
  });

  it("keeps wallet UI public-address and read-only", () => {
    const wallet = repoFile(
      "src/components/market/WalletTerminal.tsx",
    );

    expect(wallet).toContain("/api/wallet-inspector");
    expect(wallet).toContain("public EVM address");
    expect(wallet).not.toContain("privateKey");
    expect(wallet).not.toContain("sendTransaction");
    expect(wallet).not.toContain("signTransaction");
  });
});
