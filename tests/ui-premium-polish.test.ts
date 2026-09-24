import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Underly v1.0-E premium UI polish", () => {
  it("keeps primary navigation available below the desktop breakpoint", () => {
    const header = file("src/components/market/TerminalHeader.tsx");
    const css = file("src/app/terminal.css");
    const tabletRules = css.slice(
      css.indexOf("@media (max-width: 1050px)"),
      css.indexOf("@media (max-width: 720px)"),
    );

    expect(header.match(/aria-current=/g)).toHaveLength(3);
    expect(tabletRules).toContain(".tm-nav {");
    expect(tabletRules).toContain("grid-row: 2");
    expect(tabletRules).not.toMatch(/\.tm-nav\s*\{[^}]*display:\s*none/);
  });

  it("provides visible keyboard focus and reduced-motion support", () => {
    const css = file("src/app/terminal.css");
    const layout = file("src/app/layout.tsx");

    expect(css).toContain(":focus-visible");
    expect(css).toContain("outline: 2px solid var(--tm-cyan)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("scroll-margin-top: 118px");
    expect(layout).toContain('data-scroll-behavior="smooth"');
  });

  it("states exact-contract and provider provenance in the primary journey", () => {
    const landing = file("src/components/market/MarketLanding.tsx");

    expect(landing).toContain("exact contracts");
    expect(landing).toContain("provider");
    expect(landing).toContain("without signing");
  });

  it("keeps exact wrapper contracts readable without truncating identity", () => {
    const css = file("src/app/terminal.css");
    const stock = file("src/components/market/StockTerminal.tsx");

    expect(css).toContain(".tm-wrapper-id small");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("user-select: all");
    expect(css).toContain("white-space: normal");
    expect(stock).toContain("Copy exact contract");
    expect(stock).toContain("navigator.clipboard.writeText(contractAddress)");
    expect(stock).toContain('type="button"');
  });

  it("uses one internal wrapper table scroller on narrow viewports", () => {
    const css = file("src/app/terminal.css");
    const tabletRules = css.slice(
      css.indexOf("@media (max-width: 1050px)"),
      css.indexOf("@media (max-width: 720px)"),
    );

    expect(tabletRules).toMatch(/\.tm-wrapper-rows\s*\{[^}]*overflow-x:\s*auto/);
    expect(tabletRules).not.toMatch(/\.tm-wrapper-row\s*\{[^}]*overflow-x:\s*auto/);
    expect(tabletRules).toContain("min-width: 870px");
  });

  it("places snapshot comparison after the current portfolio evidence", () => {
    const wallet = file("src/components/market/WalletTerminal.tsx");

    expect(wallet.indexOf("PORTFOLIO OVERVIEW · BNB SMART CHAIN")).toBeLessThan(
      wallet.indexOf("PORTFOLIO SNAPSHOT COMPARISON · SESSION MEMORY"),
    );
    expect(wallet.indexOf("WRAPPER POSITIONS · WALLET INSPECTOR")).toBeLessThan(
      wallet.indexOf("PORTFOLIO SNAPSHOT COMPARISON · SESSION MEMORY"),
    );
  });
});
