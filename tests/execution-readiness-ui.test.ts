import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildExecutionReadinessRequest,
  describeBuildBinding,
  deriveExecutionReadinessPresentation,
  executionReadinessUiReducer,
  initialExecutionReadinessUiState,
  parseExecutionReadinessResponse,
  resultMatchesTicker,
  type ExecutionReadinessResponse,
} from "../src/lib/ui/execution-readiness";
import { buildApprovalEnvelope } from "../src/lib/underly/execution-readiness";

const WRAPPER = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";
const USDT = "0x55d398326f99059ff775485246999027b3197955";

function response(
  status: "EXECUTION_READY" | "REVIEW" | "BLOCKED" = "EXECUTION_READY",
): ExecutionReadinessResponse {
  const snapshotTimestamp = "2026-09-20T00:00:00.000Z";
  const expiresAt = "2026-09-20T00:01:00.000Z";
  const approvalEnvelope = buildApprovalEnvelope({
    chainId: "56",
    walletAddress: WALLET,
    ticker: "NVDA",
    fromTokenAddress: USDT,
    toTokenAddress: WRAPPER,
    amountRaw: "25000000000000000000",
    quotedOutputAmountRaw: "250000000000000000",
    minimumReceiveAmountRaw: "248750000000000000",
    quoteId: "quote-1",
    slippagePercent: "0.5",
    callFrom: WALLET,
    callTarget: "0x3333333333333333333333333333333333333333",
    callValue: "0",
    callData: "0x1234",
    snapshotTimestamp,
    expiresAt,
  });
  return {
    version: "0.6-B",
    executionReadinessStatus: status,
    snapshotTimestamp,
    expiresAt,
    snapshotFresh: true,
    request: {
      ticker: "NVDA",
      wrapperContractAddress: WRAPPER,
      walletAddress: WALLET,
      inputTokenAddress: USDT,
      amountRaw: "25000000000000000000",
      amountUsdt: "25",
      maxReferenceGapPct: "1",
      slippagePercent: "0.5",
    },
    selectedWrapper: {
      chainId: "56",
      ticker: "NVDA",
      provider: "provider-a",
      symbol: "NVDAX",
      contractAddress: WRAPPER,
    },
    economicExposure: {
      tokenPriceUsd: "100",
      referencePriceUsd: "100",
      tokenShareRatio: "0.01",
      shareEquivalentPriceUsd: "10000",
      referenceGapPct: "0",
      quotedTokenAmount: "0.25",
      quotedUnderlyingShares: "0.0025",
      quotedReferenceValueUsd: "0.25",
    },
    integrity: { status: "PASS", dataCompleteness: "COMPLETE" },
    corporateActions: { status: "CLEAR" },
    quote: {
      available: true,
      quoteId: "quote-1",
      vendor: "vendor",
      executionMode: "SWAP",
      inputAmountRaw: "25000000000000000000",
      outputAmountRaw: "250000000000000000",
      priceImpactPercent: "0.1",
      reverse: {
        available: true,
        vendor: "vendor",
        recoveredUsdt: "24.9",
        upstreamCode: 0,
        upstreamMessage: "success",
      },
    },
    build: {
      available: true,
      identityBindingConfirmed: true,
      validationReason: null,
      upstreamCode: 0,
      upstreamMessage: "success",
      executionMode: "SWAP",
      transactionTarget: "0x3333333333333333333333333333333333333333",
      minimumReceiveAmountRaw: "248750000000000000",
      calldataReturned: false,
      rawTransactionReturned: false,
    },
    simulation: {
      state: "SUCCESS",
      direction: "VERIFIED",
      failReason: null,
      effectValidationReason: null,
    },
    readiness: {
      status,
      reasons: [
        {
          code: status === "EXECUTION_READY" ? "READY_FOR_HUMAN_APPROVAL" : status,
          severity: status === "BLOCKED" ? "BLOCK" : status === "REVIEW" ? "REVIEW" : "INFO",
          message: "Evidence summary",
        },
      ],
      humanApprovalRequired: true,
      humanApprovalRequested: false,
      executionPermitted: false,
    },
    approvalEnvelope:
      status === "EXECUTION_READY"
        ? approvalEnvelope
        : null,
    methodology: {
      assessmentScope: "Assessment stages are separate.",
      simulationLimit: "Simulation success is predicted evidence only.",
      approvalBinding: "The digest binds only an EVM call intent.",
      expiration: "Local freshness only.",
    },
    humanApprovalRequired: true,
    humanApprovalRequested: false,
    approvalAuthorizationGranted: false,
    executionPermitted: false,
    signatureRequested: false,
    transactionBroadcast: false,
    rawTransactionReturned: false,
    privateKeyRequired: false,
  };
}

describe("Underly v0.6-C execution readiness UI behavior", () => {
  it("starts without a selected wrapper and requires explicit selection", () => {
    const state = initialExecutionReadinessUiState();
    expect(state.form.wrapperContractAddress).toBe("");
    expect(() => buildExecutionReadinessRequest("NVDA", state.form)).toThrow(
      "Select the exact BSC wrapper",
    );
  });

  it("builds the exact route request and converts USDT to 18-decimal raw units", () => {
    const payload = buildExecutionReadinessRequest("nvda", {
      wrapperContractAddress: WRAPPER,
      walletAddress: WALLET,
      amountUsdt: "25.125",
      slippagePercent: "0.5",
      maxReferenceGapPct: "1.25",
    });

    expect(payload).toEqual({
      ticker: "NVDA",
      wrapperContractAddress: WRAPPER,
      walletAddress: WALLET,
      amountRaw: "25125000000000000000",
      slippagePercent: "0.5",
      maxReferenceGapPct: "1.25",
    });
  });

  it.each(["EXECUTION_READY", "REVIEW", "BLOCKED"] as const)(
    "displays the fresh %s server decision exactly",
    (status) => {
      expect(
        deriveExecutionReadinessPresentation(
          response(status),
          Date.parse("2026-09-20T00:00:30.000Z"),
        ).status,
      ).toBe(status);
    },
  );

  it("shows only a fully validated and recomputed call-intent digest", () => {
    const result = response();
    expect(
      deriveExecutionReadinessPresentation(
        result,
        Date.parse("2026-09-20T00:00:30.000Z"),
      ).approvalDigest,
    ).toBe(result.approvalEnvelope?.digest);
  });

  it("presents a successful simulation separately from blocked quote/build binding", () => {
    const result = response("BLOCKED");
    result.build.available = true;
    result.build.identityBindingConfirmed = false;
    result.build.validationReason = "BUILD_QUOTE_ID_UNCONFIRMED";
    result.simulation.state = "SUCCESS";
    result.simulation.direction = "VERIFIED";
    result.readiness.reasons = [
      {
        code: "BUILD_QUOTE_ID_UNCONFIRMED",
        severity: "BLOCK",
        message: "Response-side quote ID is unavailable.",
      },
    ];

    const presentation = deriveExecutionReadinessPresentation(
      result,
      Date.parse("2026-09-20T00:00:30.000Z"),
    );
    const binding = describeBuildBinding(result.build);

    expect(presentation.status).toBe("BLOCKED");
    expect(presentation.assessment).toEqual({
      quoteAvailable: true,
      unsignedBuildAvailable: true,
      simulationSuccessful: true,
      executionReadinessBlocked: true,
      humanApprovalRequested: false,
    });
    expect(binding.label).toBe("QUOTE/BUILD BINDING UNCONFIRMED");
    expect(binding.detail).toContain("did not return a response-side quote ID");
    expect(presentation.approvalDigest).toBeNull();
  });

  it("downgrades an expired snapshot and withholds its approval digest", () => {
    const presentation = deriveExecutionReadinessPresentation(
      response(),
      Date.parse("2026-09-20T00:01:00.000Z"),
    );

    expect(presentation.status).toBe("STALE / RECHECK REQUIRED");
    expect(presentation.locallyFresh).toBe(false);
    expect(presentation.approvalDigest).toBeNull();
  });

  it.each([
    ["digest", (result: ExecutionReadinessResponse) => { result.approvalEnvelope!.digest = "f".repeat(64); }],
    ["quote id", (result: ExecutionReadinessResponse) => { result.approvalEnvelope!.intent.quoteId = "other"; }],
    ["wallet/from", (result: ExecutionReadinessResponse) => { result.approvalEnvelope!.intent.callFrom = "0x4444444444444444444444444444444444444444"; }],
    ["target", (result: ExecutionReadinessResponse) => { result.build.transactionTarget = "0x4444444444444444444444444444444444444444"; }],
    ["value", (result: ExecutionReadinessResponse) => { result.approvalEnvelope!.intent.callValue = "1"; }],
    ["wrapper", (result: ExecutionReadinessResponse) => { result.request.wrapperContractAddress = "0x4444444444444444444444444444444444444444"; }],
    ["non-SWAP mode", (result: ExecutionReadinessResponse) => {
      result.quote.executionMode = "RFQ";
      result.build.executionMode = "RFQ";
    }],
  ])("withholds the call-intent digest for a mismatched %s", (_name, mutate) => {
    const result = response();
    mutate(result);

    expect(
      deriveExecutionReadinessPresentation(
        result,
        Date.parse("2026-09-20T00:00:30.000Z"),
      ).approvalDigest,
    ).toBeNull();
  });

  it("rejects a malformed envelope without throwing", () => {
    const malformed = response() as unknown as Record<string, unknown>;
    malformed.approvalEnvelope = { version: "underly-call-intent-v1" };

    expect(parseExecutionReadinessResponse(malformed)).toBeNull();
    expect(() =>
      deriveExecutionReadinessPresentation(
        malformed,
        Date.parse("2026-09-20T00:00:30.000Z"),
      ),
    ).not.toThrow();
    expect(
      deriveExecutionReadinessPresentation(
        malformed,
        Date.parse("2026-09-20T00:00:30.000Z"),
      ).approvalDigest,
    ).toBeNull();
  });

  it.each([
    ["wrapperContractAddress", "0x4444444444444444444444444444444444444444"],
    ["walletAddress", "0x5555555555555555555555555555555555555555"],
    ["amountUsdt", "26"],
    ["slippagePercent", "0.75"],
    ["maxReferenceGapPct", "2"],
  ] as const)(
    "invalidates a previous result immediately when %s changes",
    (field, value) => {
      let state = initialExecutionReadinessUiState();
      state = executionReadinessUiReducer(state, {
        type: "requestStarted",
        requestId: 1,
      });
      state = executionReadinessUiReducer(state, {
        type: "requestSucceeded",
        requestId: 1,
        result: response(),
      });
      expect(state.result).not.toBeNull();

      state = executionReadinessUiReducer(state, {
        type: "inputChanged",
        field,
        value,
      });
      expect(state.result).toBeNull();
      expect(state.loading).toBe(false);
    },
  );

  it("ignores an older HTTP response after a newer request starts", () => {
    let state = initialExecutionReadinessUiState();
    state = executionReadinessUiReducer(state, {
      type: "requestStarted",
      requestId: 10,
    });
    state = executionReadinessUiReducer(state, {
      type: "requestStarted",
      requestId: 11,
    });
    state = executionReadinessUiReducer(state, {
      type: "requestSucceeded",
      requestId: 10,
      result: response(),
    });

    expect(state.result).toBeNull();
    expect(state.activeRequestId).toBe(11);
    expect(state.loading).toBe(true);
  });

  it("synchronously rejects a prior ticker result before effects run", () => {
    const prior = response();
    expect(resultMatchesTicker(prior, "NVDA")).toBe(true);
    expect(resultMatchesTicker(prior, "TSLA")).toBe(false);
  });

  it.each(["REVIEW", "BLOCKED"] as const)(
    "does not expose an approval digest for %s",
    (status) => {
      const result = response(status);
      result.approvalEnvelope = null;
      expect(
        deriveExecutionReadinessPresentation(
          result,
          Date.parse("2026-09-20T00:00:30.000Z"),
        ).approvalDigest,
      ).toBeNull();
    },
  );

  it("keeps the stock terminal additive and exposes no signing or secret input", () => {
    const terminal = readFileSync(
      "src/components/market/StockTerminal.tsx",
      "utf8",
    );
    const panel = readFileSync(
      "src/components/market/ExecutionReadinessPanel.tsx",
      "utf8",
    );

    expect(terminal).toContain(
      'import { ExecutionReadinessPanel } from "./ExecutionReadinessPanel";',
    );
    expect(terminal).toContain("<StockIntelligencePanels ticker={ticker} />");
    expect(terminal).toContain("<ContinuityPanel ticker={ticker} />");
    expect(terminal).toContain("<PreflightPanel ticker={ticker} />");
    expect(terminal).toContain(
      "<ExecutionReadinessPanel key={ticker} ticker={ticker} />",
    );
    expect(panel).toContain('fetch("/api/execution-readiness"');
    expect(panel).not.toContain("signTransaction");
    expect(panel).not.toContain("sendTransaction");
    expect(panel).not.toContain("eth_sendRawTransaction");
    expect(panel).not.toMatch(/name=["'](?:privateKey|seedPhrase)["']/);
    expect(panel).not.toMatch(/<button[^>]*>\s*(?:BUY|EXECUTE|SIGN|APPROVE|BROADCAST)\s*</i);
  });
});
