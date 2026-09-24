import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
  "src/components/market/ContinuityPanel.tsx",
  "utf8",
);

const terminal = readFileSync(
  "src/components/market/StockTerminal.tsx",
  "utf8",
);

describe("Underly v0.5 continuity UI", () => {
  it("mounts the continuity router on stock detail", () => {
    expect(terminal).toContain(
      'import { ContinuityPanel } from "./ContinuityPanel";',
    );
    expect(terminal).toContain(
      "<ContinuityPanel ticker={ticker} discovery={wrapperDiscovery} />",
    );
  });

  it("uses shared wrapper discovery and calls the quote-only continuity route", () => {
    expect(terminal).toContain("/api/asset-graph?ticker=");
    expect(panel).not.toContain("/api/asset-graph?ticker=");
    expect(panel).toContain("discovery: {");
    expect(panel).toContain('fetch("/api/continuity"');
    expect(panel).toContain("sourceContractAddress");
    expect(panel).toContain("sourceTokenAmount");
  });

  it("keeps destination selection and execution outside the UI", () => {
    expect(panel).toContain("NO AUTOMATIC TARGET SELECTION");
    expect(panel).toContain("QUOTE ONLY");
    expect(panel).not.toContain("signTransaction");
    expect(panel).not.toContain("broadcastTransaction");
    expect(panel).not.toContain("eth_sendRawTransaction");
    expect(panel).not.toContain('name="privateKey"');
  });

  it("invalidates stale requests and keeps wrapper identity exact", () => {
    expect(panel).toContain("requestSequenceRef");
    expect(panel).toContain("requestControllerRef.current?.abort()");
    expect(panel).toContain("signal: controller.signal");
    expect(panel).toContain("Continuity response context mismatch");
    expect(panel).toContain("invalidateRequest()");
    expect(panel).toContain("{deployment.contractAddress}");
  });
});
