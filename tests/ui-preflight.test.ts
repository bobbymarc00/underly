import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Underly v0.4 Preflight UI", () => {
  it("mounts Preflight as an additive stock-detail surface", () => {
    const terminal = file("src/components/market/StockTerminal.tsx");
    expect(terminal).toContain('import { PreflightPanel } from "./PreflightPanel"');
    expect(terminal).toContain("<PreflightPanel ticker={ticker} />");
  });

  it("uses the dedicated preflight endpoint and keeps the UI unsigned", () => {
    const panel = file("src/components/market/PreflightPanel.tsx");
    expect(panel).toContain('fetch("/api/preflight"');
    expect(panel).toContain("NO SIGNATURE");
    expect(panel).toMatch(/NO\s+BROADCAST/);
    expect(panel).not.toContain("sendTransaction");
    expect(panel).not.toContain("signTransaction");
    expect(panel).toContain("privateKeyRequired: false");
    expect(panel).not.toMatch(/\bprivateKey\s*:/);
    expect(panel).not.toContain('name="privateKey"');
  });

  it("does not expose a best-wrapper ranking or automatic selection", () => {
    const panel = file("src/components/market/PreflightPanel.tsx");
    const route = file("src/app/api/preflight/route.ts");
    expect(panel).toContain("NO AUTOMATIC WRAPPER SELECTION");
    expect(route).toContain("does not select a best wrapper");
    expect(route).not.toContain("selectedWrapper");
  });
});
