import { describe, expect, it } from "vitest";

import {
  classifyPreflight,
  inspectSimulationDirection,
  simulationStateFromResult,
} from "../src/lib/underly/preflight";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const WRAPPER = "0x1111111111111111111111111111111111111111";
const WALLET = "0x2222222222222222222222222222222222222222";

function clear(overrides = {}) {
  return classifyPreflight({
    economicAvailable: true,
    quoteAvailable: true,
    reverseQuoteAvailable: true,
    corporateActionStatus: "CLEAR",
    integrityStatus: "PASS",
    tradingAvailable: true,
    simulationState: "SUCCESS",
    simulationDirection: "VERIFIED",
    referenceGapPct: "0.25",
    maxReferenceGapPct: null,
    ...overrides,
  });
}

describe("Underly v0.4 preflight policy", () => {
  it("returns READY only when the full simulated snapshot is clear", () => {
    expect(clear().status).toBe("READY");
  });

  it("hard-blocks a BLOCKED integrity state", () => {
  const result = clear({
    integrityStatus: "BLOCKED",
  });

  expect(result.status).toBe("BLOCKED");
  expect(result.reasons.map((item) => item.code)).toContain(
    "INTEGRITY_BLOCKED",
  );
});
  it("keeps quote-only preflight in REVIEW instead of pretending execution readiness", () => {
    const result = clear({
      simulationState: "NOT_REQUESTED",
      simulationDirection: "NOT_APPLICABLE",
    });

    expect(result.status).toBe("REVIEW");
    expect(result.reasons.map((item) => item.code)).toContain(
      "SIMULATION_NOT_REQUESTED",
    );
  });

  it("blocks an explicit active corporate action", () => {
    const result = clear({ corporateActionStatus: "ACTIVE" });
    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.map((item) => item.code)).toContain(
      "ACTIONGUARD_ACTIVE",
    );
  });

  it("blocks only when a user-supplied reference guard is exceeded", () => {
    const result = clear({
      referenceGapPct: "1.25",
      maxReferenceGapPct: "1",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.map((item) => item.code)).toContain(
      "REFERENCE_GUARD_EXCEEDED",
    );
  });

  it("treats missing allowance as REVIEW rather than a fake successful swap", () => {
    expect(
      simulationStateFromResult({
        status: "FAILED",
        failReason: "execution reverted: ERC20InsufficientAllowance",
      }),
    ).toBe("ALLOWANCE_REQUIRED");

    const result = clear({
      simulationState: "ALLOWANCE_REQUIRED",
      simulationDirection: "NOT_APPLICABLE",
    });
    expect(result.status).toBe("REVIEW");
  });

  it("verifies expected wallet USDT-out and wrapper-in simulation direction", () => {
    const direction = inspectSimulationDirection({
      walletAddress: WALLET,
      spendTokenAddress: USDT,
      receiveTokenAddress: WRAPPER,
      changes: [
        { contractAddress: USDT, owner: WALLET, change: "-25000000000000000000" },
        { contractAddress: WRAPPER, owner: WALLET, change: "125000000000000000" },
      ],
    });

    expect(direction.state).toBe("VERIFIED");
    expect(direction.spendTokenDelta).toBe("-25000000000000000000");
    expect(direction.receiveTokenDelta).toBe("125000000000000000");
  });

  it("blocks a contradictory simulation direction", () => {
    const result = clear({ simulationDirection: "CONTRADICTORY" });
    expect(result.status).toBe("BLOCKED");
    expect(result.reasons.map((item) => item.code)).toContain(
      "SIMULATION_DIRECTION_CONTRADICTORY",
    );
  });
  it("fails closed when a provider returns SUCCESS together with a non-empty failure reason", () => {
    expect(
      simulationStateFromResult({
        status: "SUCCESS",
        failReason: "execution reverted: ERC20InsufficientBalance",
      }),
    ).toBe("FAILED");
  });

  it("keeps NOT_APPLICABLE integrity in REVIEW", () => {
    const result = clear({
      integrityStatus: "NOT_APPLICABLE",
    });

    expect(result.status).toBe("REVIEW");
    expect(result.reasons.map((item) => item.code)).toContain(
      "INTEGRITY_NOT_APPLICABLE",
    );
  });
});
