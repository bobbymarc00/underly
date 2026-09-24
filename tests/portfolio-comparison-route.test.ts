import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/portfolio/compare/route";
import type { PortfolioComparisonSnapshot } from "@/lib/underly/portfolio-comparison";

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function emptySnapshot(
  block: number,
  address = WALLET,
): PortfolioComparisonSnapshot {
  return {
    version: "0.8-A",
    generatedAt: `2026-09-23T00:00:0${block}.000Z`,
    address,
    chainId: "56",
    status: "AVAILABLE",
    scope: "BSC_TOKENIZED_EQUITY_WRAPPERS_ONLY",
    snapshot: {
      rpcChainId: "56",
      blockTag: `0x${block.toString(16)}`,
      blockNumber: String(block),
      blockTimestamp: null,
      blockTimestampStatus: "UNAVAILABLE",
      blockTimestampReason: "TEST",
    },
    universe: {
      source: "TEST",
      status: "AVAILABLE",
      reason: null,
      receivedCount: 1,
      chainCandidateCount: 1,
      validatedWrapperCount: 1,
      rejectedCount: 0,
      rejected: [],
    },
    summary: {
      checkedWrapperCount: 1,
      positiveBalanceCount: 0,
      provenZeroBalanceCount: 1,
      failedBalanceCount: 0,
      metadataFailureCount: 0,
      positionCount: 0,
      underlyingCount: 0,
      indicativeValueUsd: "0",
      knownIndicativeValueUsd: "0",
      valuationStatus: "AVAILABLE",
    },
    positions: [],
    exposures: {
      status: "AVAILABLE",
      denominator: {
        basis: "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
        knownIndicativeValueUsd: "0",
        knownValuePositionCount: 0,
        unknownValuePositionCount: 0,
        status: "UNAVAILABLE",
      },
      coverage: {
        inputPositionCount: 0,
        uniquePositionCount: 0,
        duplicatePositionCount: 0,
        unknownIdentityPositionCount: 0,
        knownValuePositionCount: 0,
        unknownValuePositionCount: 0,
        valuationCoveragePct: null,
        status: "UNAVAILABLE",
      },
      reconciliation: {
        exposureKnownIndicativeValueUsd: "0",
        portfolioKnownIndicativeValueUsd: "0",
        status: "MATCH",
      },
      byUnderlying: [],
      byWrapper: [],
      byProvider: [],
    },
    balanceChecks: [
      {
        chainId: "56",
        contractAddress: "0x1111111111111111111111111111111111111111",
        blockTag: `0x${block.toString(16)}`,
        status: "ZERO",
        balanceBaseUnits: "0",
        error: null,
      },
    ],
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
  };
}

function request(body: unknown) {
  return new Request("http://localhost:3000/api/portfolio/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("portfolio comparison route", () => {
  it("validates client-supplied snapshots and returns a stateless comparison", async () => {
    const response = await POST(
      request({ snapshotA: emptySnapshot(1), snapshotB: emptySnapshot(2) }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      version: "0.9-A",
      status: "AVAILABLE",
      changeSummary: "NO_OBSERVED_CHANGE",
      provenance: {
        type: "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES",
        independentlyVerified: false,
        persisted: false,
      },
      readOnly: {
        networkRequests: [],
        transactionMethods: [],
      },
    });
  });

  it("rejects malformed or write-capable snapshot envelopes", async () => {
    const malformed = await POST(request({ snapshotA: {}, snapshotB: {} }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      error: "INVALID_PORTFOLIO_SNAPSHOT_PAIR",
    });

    const writeCapable = emptySnapshot(1);
    writeCapable.readOnly.transactionMethods.push("eth_sendTransaction");
    const unsafe = await POST(
      request({ snapshotA: writeCapable, snapshotB: emptySnapshot(2) }),
    );
    expect(unsafe.status).toBe(400);
  });

  it("rejects wallet mismatch without attempting any external read", async () => {
    const response = await POST(
      request({
        snapshotA: emptySnapshot(1),
        snapshotB: emptySnapshot(
          2,
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ),
      }),
    );
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "WALLET_MISMATCH",
    });
  });
});
