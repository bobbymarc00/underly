import { describe, expect, it } from "vitest";

import {
  buildApprovalEnvelope,
  classifyExecutionReadiness,
  isReadinessSnapshotFresh,
} from "../src/lib/underly/execution-readiness";
import {
  sha256Calldata,
  sha256Text,
} from "../src/lib/underly/approval-digest";

function clear(overrides = {}) {
  return classifyExecutionReadiness({
    preflightStatus: "READY",
    quoteAvailable: true,
    quoteIdAvailable: true,
    buildAvailable: true,
    simulationState: "SUCCESS",
    simulationDirection: "VERIFIED",
    ...overrides,
  });
}

function approvalInput(overrides: Record<string, string> = {}) {
  return {
    chainId: "56",
    walletAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ticker: "nvda",
    fromTokenAddress: "0x55d398326f99059fF775485246999027B3197955",
    toTokenAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    amountRaw: "25000000000000000000",
    quotedOutputAmountRaw: "250000000000000000",
    minimumReceiveAmountRaw: "248750000000000000",
    quoteId: "quote-123",
    slippagePercent: "0.5",
    callFrom: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    callTarget: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    callValue: "0",
    callData: "0x1234",
    snapshotTimestamp: "2026-09-20T00:00:00.000Z",
    expiresAt: "2026-09-20T00:01:00.000Z",
    ...overrides,
  };
}

describe("Underly v0.6 execution readiness", () => {
  it("uses a browser-safe SHA-256 implementation over text and calldata bytes", () => {
    const expected =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(sha256Text("abc")).toBe(expected);
    expect(sha256Calldata("0x616263")).toBe(expected);
  });
  it("returns EXECUTION_READY only after a clear fresh simulated route", () => {
    const result = clear();

    expect(result.status).toBe("EXECUTION_READY");
    expect(result.humanApprovalRequired).toBe(true);
    expect(result.executionPermitted).toBe(false);
    expect(result.reasons.map((item) => item.code)).toContain(
      "READY_FOR_HUMAN_APPROVAL",
    );
  });

  it("never converts readiness into execution permission", () => {
    expect(clear().executionPermitted).toBe(false);
  });

  it("blocks when fresh preflight is blocked", () => {
    const result = clear({
      preflightStatus: "BLOCKED",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.map((item) => item.code)).toContain(
      "PREFLIGHT_BLOCKED",
    );
  });

  it("keeps a review preflight in REVIEW", () => {
    const result = clear({
      preflightStatus: "REVIEW",
    });

    expect(result.status).toBe("REVIEW");
  });

  it("blocks when the selected quote cannot be bound by quote id", () => {
    const result = clear({
      quoteIdAvailable: false,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.map((item) => item.code)).toContain(
      "QUOTE_ID_UNAVAILABLE",
    );
  });

  it("blocks when unsigned build is unavailable", () => {
    expect(
      clear({
        buildAvailable: false,
      }).status,
    ).toBe("BLOCKED");
  });

  it("keeps a simulated unsigned build blocked when response-side quote binding is absent", () => {
    const result = clear({
      buildAvailable: false,
      unsignedBuildAvailable: true,
      buildValidationReason: "BUILD_QUOTE_ID_UNCONFIRMED",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.humanApprovalRequested).toBe(false);
    expect(result.reasons).toContainEqual({
      code: "BUILD_QUOTE_ID_UNCONFIRMED",
      severity: "BLOCK",
      message:
        "Binance returned an unsigned build, but its response did not return the quote ID needed to independently bind that build to the selected quote.",
    });
  });

  it("keeps allowance-required routes in REVIEW", () => {
    const result = clear({
      simulationState: "ALLOWANCE_REQUIRED",
      simulationDirection: "NOT_APPLICABLE",
    });

    expect(result.status).toBe("REVIEW");
    expect(result.reasons.map((item) => item.code)).toContain(
      "ALLOWANCE_REQUIRED",
    );
  });

  it("blocks failed simulation", () => {
    expect(
      clear({
        simulationState: "FAILED",
        simulationDirection: "NOT_APPLICABLE",
      }).status,
    ).toBe("BLOCKED");
  });

  it("blocks contradictory simulated balance direction", () => {
    expect(
      clear({
        simulationDirection: "CONTRADICTORY",
      }).status,
    ).toBe("BLOCKED");
  });

  it("binds human review to a canonical EVM call intent only", () => {
    const envelope = buildApprovalEnvelope(approvalInput());

    expect(envelope.version).toBe("underly-call-intent-v1");
    expect(envelope.scope).toBe("EVM_CALL_INTENT_ONLY");
    expect(envelope.intent.ticker).toBe("NVDA");
    expect(envelope.intent.walletAddress).toBe(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(envelope.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.humanApprovalRequired).toBe(true);
    expect(envelope.finalTransactionApprovalRequired).toBe(true);
    expect(envelope.nonceBound).toBe(false);
    expect(envelope.gasBound).toBe(false);
    expect(envelope.feesBound).toBe(false);
    expect(envelope.intent.allowanceTokenAddress).toBe(
      envelope.intent.fromTokenAddress,
    );
    expect(envelope.intent.allowanceSpenderAddress).toBe(
      envelope.intent.callTarget,
    );
    expect(envelope.intent.maximumAllowanceDecreaseRaw).toBe(
      envelope.intent.amountRaw,
    );
    expect(envelope.signatureRequested).toBe(false);
    expect(envelope.transactionBroadcast).toBe(false);
    expect(envelope.intent.callDataHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(envelope)).not.toContain("0x1234");
  });

  it.each([
    ["chain", { chainId: "1" }],
    ["ticker", { ticker: "TSLA" }],
    ["calldata", { callData: "0xabcd" }],
    ["value", { callValue: "1" }],
    [
      "wallet",
      {
        walletAddress: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        callFrom: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      },
    ],
    ["amount", { amountRaw: "26000000000000000000" }],
    ["quoted output", { quotedOutputAmountRaw: "260000000000000000" }],
    ["minimum receive", { minimumReceiveAmountRaw: "248000000000000000" }],
    ["quote id", { quoteId: "quote-456" }],
    ["slippage", { slippagePercent: "0.75" }],
    [
      "input token",
      { fromTokenAddress: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE" },
    ],
    [
      "selected wrapper token",
      { toTokenAddress: "0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE" },
    ],
    [
      "call target",
      { callTarget: "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF" },
    ],
    ["snapshot", { snapshotTimestamp: "2026-09-20T00:00:01.000Z" }],
    ["expiry", { expiresAt: "2026-09-20T00:02:00.000Z" }],
  ])("changes the approval digest when %s changes", (_name, mutation) => {
    const base = approvalInput();

    const first = buildApprovalEnvelope(base);
    const second = buildApprovalEnvelope({
      ...base,
      ...mutation,
    });

    expect(first.digest).not.toBe(second.digest);
  });

  it("canonicalizes equivalent casing without changing the digest", () => {
    const base = approvalInput({ callData: "0x12ab" });

    const first = buildApprovalEnvelope(base);
    const second = buildApprovalEnvelope({
      ...base,
      chainId: "056",
      walletAddress: base.walletAddress.toLowerCase(),
      ticker: "NVDA",
      amountRaw: `0${base.amountRaw}`,
      quotedOutputAmountRaw: `0${base.quotedOutputAmountRaw}`,
      minimumReceiveAmountRaw: `0${base.minimumReceiveAmountRaw}`,
      slippagePercent: "0.5000",
      callTarget: base.callTarget.toLowerCase(),
      callData: "0x12AB",
    });

    expect(first.digest).toBe(second.digest);
  });

  it.each([
    ["empty quote id", { quoteId: "   " }],
    ["malformed calldata", { callData: "0x123" }],
    ["malformed uint", { amountRaw: "1.0" }],
    ["zero wallet", { walletAddress: "0x0000000000000000000000000000000000000000", callFrom: "0x0000000000000000000000000000000000000000" }],
    ["wallet/from mismatch", { callFrom: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD" }],
    ["minimum above quote", { minimumReceiveAmountRaw: "250000000000000001" }],
    ["invalid timestamp", { snapshotTimestamp: "not-a-date" }],
  ])("rejects %s inside the envelope builder", (_name, mutation) => {
    expect(() => buildApprovalEnvelope(approvalInput(mutation))).toThrow();
  });

  it("rejects expired local snapshots", () => {
    expect(
      isReadinessSnapshotFresh({
        snapshotTimestamp: "2026-09-20T00:00:00.000Z",
        expiresAt: "2026-09-20T00:01:00.000Z",
        now: new Date("2026-09-20T00:01:00.000Z"),
      }),
    ).toBe(false);
  });
});
