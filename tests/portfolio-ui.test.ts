import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { PortfolioPayload } from "@/lib/ui/market-types";
import type { PortfolioComparisonResult } from "@/lib/underly/portfolio-comparison";
import { isCurrentComparisonResponse } from "@/lib/ui/portfolio-comparison";
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

function exposures(): NonNullable<PortfolioPayload["exposures"]> {
  return {
    status: "AVAILABLE",
    denominator: {
      basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
      knownIndicativeValueUsd: "15",
      knownValuePositionCount: 1,
      unknownValuePositionCount: 0,
      status: "AVAILABLE",
    },
    coverage: {
      inputPositionCount: 1,
      uniquePositionCount: 1,
      duplicatePositionCount: 0,
      unknownIdentityPositionCount: 0,
      knownValuePositionCount: 1,
      unknownValuePositionCount: 0,
      valuationCoveragePct: "100",
      status: "COMPLETE",
    },
    reconciliation: {
      exposureKnownIndicativeValueUsd: "15",
      portfolioKnownIndicativeValueUsd: "15",
      status: "MATCH",
    },
    byUnderlying: [],
    byWrapper: [],
    byProvider: [],
  };
}

describe("unified portfolio UI semantics", () => {
  it("accepts the actual v0.7-A envelope and rejects malformed responses", () => {
    expect(isPortfolioPayload(payload())).toBe(true);
    expect(isPortfolioPayload({ ...payload(), positions: null })).toBe(false);
    expect(isPortfolioPayload({ ...payload(), address: "0x1234" })).toBe(false);
    expect(isPortfolioPayload({ ...payload(), readOnly: null })).toBe(false);
  });

  it("validates additive v0.8-A exposure intelligence at the UI boundary", () => {
    const current = payload({ version: "0.8-A", exposures: exposures() });
    expect(isPortfolioPayload(current)).toBe(true);
    expect(isPortfolioPayload({ ...current, exposures: undefined })).toBe(false);
    expect(
      isPortfolioPayload({
        ...current,
        exposures: {
          ...exposures(),
          denominator: {
            ...exposures().denominator,
            knownIndicativeValueUsd: "not-a-decimal",
          },
        },
      }),
    ).toBe(false);
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
    expect(terminal).toContain('fetch("/api/portfolio/compare"');
    expect(terminal).not.toMatch(/fetch\([^)]*\/api\/wallet-inspector/s);
    expect(terminal.match(/\bfetch\(/g)).toHaveLength(2);
    expect(terminal).toContain("WRAPPER POSITIONS · WALLET INSPECTOR");
    expect(terminal).toContain("displayedResult.underlyingExposures.map");
    expect(terminal).toContain("displayedResult.positions.map");
    expect(terminal).toContain("displayedResult.exposures.byUnderlying.map");
    expect(terminal).toContain("displayedResult.exposures.byWrapper.map");
    expect(terminal).toContain("displayedResult.exposures.byProvider.map");
    expect(terminal).toContain("KNOWN-VALUE WEIGHT");
    expect(terminal).toContain("not the complete portfolio");
    expect(terminal).toContain("not issuer identity or evidence of legal rights");
    expect(terminal).toContain("No historical P&amp;L, cost basis, or dividend entitlement");
  });

  it("keeps A/B snapshots in session memory and clears them when the wallet changes", () => {
    const terminal = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(terminal).toContain("CAPTURE SNAPSHOT A");
    expect(terminal).toContain("CAPTURE SNAPSHOT B");
    expect(terminal).toContain("Refreshing or closing this page");
    expect(terminal).toContain("setSnapshotA(null)");
    expect(terminal).toContain("setSnapshotB(null)");
    expect(terminal).toContain("setComparison(null)");
    expect(terminal).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });

  it("rejects a stale comparison after the address or snapshot pair changes", () => {
    const a = payload({
      generatedAt: "2026-09-23T00:00:01.000Z",
      address: WALLET_A,
      chainId: "56",
    });
    const b = payload({
      generatedAt: "2026-09-23T00:00:02.000Z",
      address: WALLET_A,
      chainId: "56",
    });
    const comparison = {
      address: WALLET_A,
      chainId: "56",
      snapshots: {
        A: { generatedAt: a.generatedAt },
        B: { generatedAt: b.generatedAt },
      },
    } as PortfolioComparisonResult;

    expect(
      isCurrentComparisonResponse({
        result: comparison,
        inputAddress: WALLET_A,
        snapshotA: a,
        snapshotB: b,
      }),
    ).toBe(true);
    expect(
      isCurrentComparisonResponse({
        result: comparison,
        inputAddress: WALLET_B,
        snapshotA: a,
        snapshotB: b,
      }),
    ).toBe(false);
    expect(
      isCurrentComparisonResponse({
        result: comparison,
        inputAddress: WALLET_A,
        snapshotA: a,
        snapshotB: { ...b, generatedAt: "2026-09-23T00:00:03.000Z" },
      }),
    ).toBe(false);
  });

  it("explains empty universe coverage without presenting a proven-zero wallet", () => {
    const terminal = readFileSync(
      resolve(process.cwd(), "src/components/market/WalletTerminal.tsx"),
      "utf8",
    );

    expect(terminal).toContain('case "RWA_UNIVERSE_EMPTY"');
    expect(terminal).toContain("wallet coverage cannot be established");
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
    expect(terminal).toContain("comparisonSequence.current += 1");
    expect(terminal).toContain("comparisonPair.current !== pair");
    expect(terminal).toContain("comparisonController.current?.abort()");
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
      "src/lib/ui/portfolio-comparison.ts",
      "src/lib/underly/portfolio-comparison.ts",
      "src/app/api/portfolio/compare/route.ts",
      "src/app/stock/[ticker]/page.tsx",
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8"));
    const source = files.join("\n");

    expect(source).not.toMatch(/fetch\(["']\/api\/(continuity|preflight|execution-readiness)/);
    expect(source).not.toMatch(/eth_sendTransaction|eth_sendRawTransaction|personal_sign|eth_signTypedData/i);
    expect(source).not.toMatch(/\b(signTransaction|sendTransaction|broadcastTransaction|approveErc20)\s*\(/);
  });
});
