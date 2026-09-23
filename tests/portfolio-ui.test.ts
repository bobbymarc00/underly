import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { PortfolioPayload } from "@/lib/ui/market-types";
import {
  buildContinuityHref,
  isCurrentPortfolioResponse,
  isPortfolioPayload,
  portfolioValuePresentation,
} from "@/lib/ui/portfolio";

const WALLET_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WALLET_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const CONTRACT = "0x1111111111111111111111111111111111111111";

function payload(
  overrides: Partial<PortfolioPayload> = {},
): PortfolioPayload {
  return {
    version: "0.7-A",
    generatedAt: "2026-09-23T00:00:00.000Z",
    address: WALLET_A,
    chainId: "56",
    status: "AVAILABLE",
    summary: {
      checkedWrapperCount: 2,
      positiveBalanceCount: 1,
      provenZeroBalanceCount: 1,
      failedBalanceCount: 0,
      metadataFailureCount: 0,
      positionCount: 1,
      underlyingCount: 1,
      indicativeValueUsd: "15",
      knownIndicativeValueUsd: "15",
      valuationStatus: "AVAILABLE",
    },
    positions: [],
    underlyingExposures: [],
    balanceChecks: [],
    readOnly: {
      enabled: true,
      rpcMethods: ["eth_chainId", "eth_blockNumber", "eth_call"],
      transactionMethods: [],
      privateKeyRequired: false,
      signatureRequired: false,
      approvalRequired: false,
      quoteRequested: false,
      transactionBuilt: false,
      simulationRequested: false,
    },
    ...overrides,
  };
}

describe("unified portfolio UI semantics", () => {
  it("accepts the actual v0.7-A envelope and rejects malformed responses", () => {
    expect(isPortfolioPayload(payload())).toBe(true);
    expect(isPortfolioPayload({ ...payload(), positions: null })).toBe(false);
    expect(isPortfolioPayload({ ...payload(), address: "0x1234" })).toBe(false);
    expect(isPortfolioPayload({ ...payload(), readOnly: null })).toBe(false);
  });

  it("never presents a partial known subtotal as the complete portfolio total", () => {
    const partial = payload({
      status: "PARTIAL",
      summary: {
        ...payload().summary!,
        indicativeValueUsd: null,
        knownIndicativeValueUsd: "12.5",
        valuationStatus: "PARTIAL",
      },
    });

    expect(portfolioValuePresentation(payload())).toMatchObject({
      label: "INDICATIVE PORTFOLIO VALUE",
      value: "15",
      complete: true,
    });
    expect(portfolioValuePresentation(partial)).toEqual({
      label: "KNOWN INDICATIVE VALUE",
      value: "12.5",
      note: "Partial only — positions without valuation evidence are excluded.",
      complete: false,
    });
    expect(
      portfolioValuePresentation({
        ...partial,
        summary: {
          ...partial.summary!,
          knownIndicativeValueUsd: "0",
        },
      }),
    ).toMatchObject({
      label: "KNOWN INDICATIVE VALUE",
      value: null,
      complete: false,
    });
  });

  it("renders no previous-wallet result after the input address changes", () => {
    const result = payload();
    expect(isCurrentPortfolioResponse(result, WALLET_A, WALLET_A)).toBe(true);
    expect(isCurrentPortfolioResponse(result, WALLET_B, WALLET_A)).toBe(false);
    expect(isCurrentPortfolioResponse(result, WALLET_B, WALLET_B)).toBe(false);
    expect(isCurrentPortfolioResponse(null, WALLET_A, WALLET_A)).toBe(false);
  });

  it("builds a validated continuity handoff without triggering continuity", () => {
    expect(
      buildContinuityHref({
        ticker: "nvda",
        contractAddress: CONTRACT.toUpperCase(),
        tokenQuantity: "1.2500",
        identityStatus: "AVAILABLE",
      }),
    ).toBe(
      `/stock/NVDA?continuitySource=${CONTRACT}&continuityAmount=1.2500`,
    );
    expect(
      buildContinuityHref({
        ticker: "NVDA",
        contractAddress: CONTRACT,
        tokenQuantity: null,
        identityStatus: "AVAILABLE",
      }),
    ).toBeNull();
    expect(
      buildContinuityHref({
        ticker: "NVDA",
        contractAddress: CONTRACT,
        tokenQuantity: "1",
        identityStatus: "UNAVAILABLE",
      }),
    ).toBeNull();
  });

  it("uses one address and one portfolio request for inspector and portfolio views", () => {
    const terminal = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(terminal).toContain("/api/portfolio?address=");
    expect(terminal).not.toMatch(/fetch\([^)]*\/api\/wallet-inspector/s);
    expect(terminal.match(/\bfetch\(/g)).toHaveLength(1);
    expect(terminal).toContain("WRAPPER POSITIONS · WALLET INSPECTOR");
    expect(terminal).toContain("displayedResult.underlyingExposures.map");
    expect(terminal).toContain("displayedResult.positions.map");
  });

  it("keeps partial, missing, and failed evidence visible without converting it to zero", () => {
    const terminal = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(terminal).toContain('check.status === "RPC_ERROR"');
    expect(terminal).toContain("not counted as zero");
    expect(terminal).toContain("formatNumber(position.equivalence.tokenShareRatio)");
    expect(terminal).toContain("formatUsd(position.valuation.indicativeValueUsd)");
    expect(terminal).toContain("Some balances remain unknown");
  });

  it("guards stale requests synchronously and at the async response boundary", () => {
    const terminal = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(terminal).toContain("new AbortController()");
    expect(terminal).toContain("sequence.current += 1");
    expect(terminal).toContain("requestSequence !== sequence.current");
    expect(terminal).toContain("isCurrentPortfolioResponse(");
    expect(terminal).toContain("setResult(null)");
  });

  it("passes validated context to stock continuity without automatic execution", () => {
    const stockPage = readFileSync(
      resolve(process.cwd(), "src/app/stock/[ticker]/page.tsx"),
      "utf8",
    );
    const continuity = readFileSync(
      resolve(process.cwd(), "src/components/market/ContinuityPanel.tsx"),
      "utf8",
    );
    const wallet = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(stockPage).toContain("ContinuityRequestSchema.safeParse");
    expect(stockPage).toContain("continuityContext={continuityContext}");
    expect(continuity).toContain("initialContext.sourceContractAddress");
    expect(continuity).toContain("if (requestedSource && initialContext)");
    expect(continuity).toContain('setSourceAmount("1")');
    expect(continuity).toContain("REVIEW BEFORE MEASURING");
    expect(wallet).not.toContain('fetch("/api/continuity"');
  });

  it("does not add automatic quote, build, simulation, signing, approval, or broadcast", () => {
    const files = [
      "src/components/market/WalletTerminal.tsx",
      "src/lib/ui/portfolio.ts",
      "src/app/stock/[ticker]/page.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
    const source = files.join("\n");

    expect(source).not.toMatch(/fetch\(["']\/api\/(continuity|preflight|execution-readiness)/);
    expect(source).not.toMatch(/eth_sendTransaction|eth_sendRawTransaction|personal_sign|eth_signTypedData/i);
    expect(source).not.toMatch(/\b(signTransaction|sendTransaction|broadcastTransaction|approveErc20)\s*\(/);
  });
});
