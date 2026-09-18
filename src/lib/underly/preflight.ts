import Decimal from "decimal.js";
import type { CheckState } from "@/types";
import type { CorporateActionStatus } from "./actions";

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

export type PreflightDecisionStatus = "READY" | "REVIEW" | "BLOCKED";

export type PreflightSimulationState =
  | "NOT_REQUESTED"
  | "SKIPPED_POLICY"
  | "SUCCESS"
  | "ALLOWANCE_REQUIRED"
  | "FAILED"
  | "BUILD_UNAVAILABLE"
  | "UPSTREAM_ERROR";

export type SimulationDirectionState =
  | "NOT_APPLICABLE"
  | "VERIFIED"
  | "INCOMPLETE"
  | "CONTRADICTORY";

export interface PreflightReason {
  code: string;
  severity: "BLOCK" | "REVIEW" | "INFO";
  message: string;
}

export interface PreflightDecision {
  status: PreflightDecisionStatus;
  reasons: PreflightReason[];
}

export interface SimulationBalanceChangeLike {
  contractAddress?: string | null;
  change?: string | null;
  owner?: string | null;
}

export interface SimulationDirectionResult {
  state: SimulationDirectionState;
  spendTokenDelta: string | null;
  receiveTokenDelta: string | null;
}

function normalizeAddress(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function decimal(value?: string | null): Decimal | null {
  if (!value) return null;
  try {
    const parsed = new PreciseDecimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

function reason(
  code: string,
  severity: PreflightReason["severity"],
  message: string,
): PreflightReason {
  return { code, severity, message };
}

export function simulationStateFromResult(params: {
  status?: string | null;
  failReason?: string | null;
}): PreflightSimulationState {
  const failure = (params.failReason ?? "").trim().toLowerCase();

  if (
    failure.includes("allowance") ||
    failure.includes("approve") ||
    failure.includes("approval")
  ) {
    return "ALLOWANCE_REQUIRED";
  }

  if (failure) return "FAILED";

  if ((params.status ?? "").toUpperCase() === "SUCCESS") {
    return "SUCCESS";
  }

  return "FAILED";
}

export function inspectSimulationDirection(params: {
  changes: SimulationBalanceChangeLike[];
  walletAddress: string;
  spendTokenAddress: string;
  receiveTokenAddress: string;
}): SimulationDirectionResult {
  const wallet = normalizeAddress(params.walletAddress);
  const spend = normalizeAddress(params.spendTokenAddress);
  const receive = normalizeAddress(params.receiveTokenAddress);

  let spendDelta = new PreciseDecimal(0);
  let receiveDelta = new PreciseDecimal(0);
  let sawSpend = false;
  let sawReceive = false;

  for (const change of params.changes) {
    if (normalizeAddress(change.owner) !== wallet) continue;

    const amount = decimal(change.change);
    if (!amount) continue;

    const contract = normalizeAddress(change.contractAddress);
    if (contract === spend) {
      spendDelta = spendDelta.plus(amount);
      sawSpend = true;
    }
    if (contract === receive) {
      receiveDelta = receiveDelta.plus(amount);
      sawReceive = true;
    }
  }

  const spendTokenDelta = sawSpend ? transport(spendDelta) : null;
  const receiveTokenDelta = sawReceive ? transport(receiveDelta) : null;

  if (
    (sawSpend && spendDelta.gt(0)) ||
    (sawReceive && receiveDelta.lt(0))
  ) {
    return {
      state: "CONTRADICTORY",
      spendTokenDelta,
      receiveTokenDelta,
    };
  }

  if (sawSpend && sawReceive && spendDelta.lt(0) && receiveDelta.gt(0)) {
    return {
      state: "VERIFIED",
      spendTokenDelta,
      receiveTokenDelta,
    };
  }

  return {
    state: "INCOMPLETE",
    spendTokenDelta,
    receiveTokenDelta,
  };
}

function referenceGuardState(params: {
  referenceGapPct: string | null;
  maxReferenceGapPct: string | null;
}): "NOT_SET" | "PASS" | "EXCEEDED" | "UNKNOWN" {
  if (!params.maxReferenceGapPct) return "NOT_SET";

  const gap = decimal(params.referenceGapPct);
  const max = decimal(params.maxReferenceGapPct);
  if (!max || max.lt(0)) return "UNKNOWN";
  if (!gap) return "UNKNOWN";

  return gap.abs().lte(max) ? "PASS" : "EXCEEDED";
}

export function classifyPreflight(params: {
  economicAvailable: boolean;
  quoteAvailable: boolean;
  reverseQuoteAvailable: boolean;
  corporateActionStatus: CorporateActionStatus;
  integrityStatus: CheckState;
  tradingAvailable: boolean | null;
  simulationState: PreflightSimulationState;
  simulationDirection: SimulationDirectionState;
  referenceGapPct: string | null;
  maxReferenceGapPct: string | null;
}): PreflightDecision {
  const reasons: PreflightReason[] = [];

  if (!params.economicAvailable) {
    reasons.push(
      reason(
        "ECONOMIC_EQUIVALENCE_UNAVAILABLE",
        "BLOCK",
        "Current token/share ratio, token price, and reference evidence are not sufficient to normalize this representation.",
      ),
    );
  }

  if (!params.quoteAvailable) {
    reasons.push(
      reason(
        "ENTRY_ROUTE_UNAVAILABLE",
        "BLOCK",
        "No current executable entry quote is available for this representation.",
      ),
    );
  }

  if (params.corporateActionStatus === "ACTIVE") {
    reasons.push(
      reason(
        "ACTIONGUARD_ACTIVE",
        "BLOCK",
        "Current RWA status evidence indicates an active corporate-action restriction.",
      ),
    );
  } else if (params.corporateActionStatus === "UNKNOWN") {
    reasons.push(
      reason(
        "ACTIONGUARD_UNKNOWN",
        "REVIEW",
        "Current corporate-action state could not be classified with authoritative status evidence.",
      ),
    );
  }

  const guard = referenceGuardState({
    referenceGapPct: params.referenceGapPct,
    maxReferenceGapPct: params.maxReferenceGapPct,
  });

  if (guard === "EXCEEDED") {
    reasons.push(
      reason(
        "REFERENCE_GUARD_EXCEEDED",
        "BLOCK",
        "The current ratio-adjusted reference gap exceeds the user-supplied maximum gap guard.",
      ),
    );
  } else if (guard === "UNKNOWN") {
    reasons.push(
      reason(
        "REFERENCE_GUARD_UNVERIFIABLE",
        "BLOCK",
        "A maximum reference-gap guard was supplied but the current gap could not be verified.",
      ),
    );
  }

  if (params.simulationState === "FAILED") {
    reasons.push(
      reason(
        "SIMULATION_FAILED",
        "BLOCK",
        "Binance Transaction API predicts that the unsigned swap transaction will fail.",
      ),
    );
  } else if (
    params.simulationState === "BUILD_UNAVAILABLE" ||
    params.simulationState === "UPSTREAM_ERROR"
  ) {
    reasons.push(
      reason(
        "SIMULATION_UNAVAILABLE",
        "BLOCK",
        "A wallet simulation was requested but an unsigned transaction or simulation result could not be obtained.",
      ),
    );
  } else if (params.simulationState === "ALLOWANCE_REQUIRED") {
    reasons.push(
      reason(
        "ALLOWANCE_REQUIRED",
        "REVIEW",
        "The swap simulation indicates that ERC-20 approval/allowance must be handled before the swap can succeed.",
      ),
    );
  } else if (params.simulationState === "NOT_REQUESTED") {
    reasons.push(
      reason(
        "SIMULATION_NOT_REQUESTED",
        "REVIEW",
        "No wallet address was supplied, so Underly stopped at quote-only preflight and did not build or simulate a transaction.",
      ),
    );
  }

  if (params.simulationDirection === "CONTRADICTORY") {
    reasons.push(
      reason(
        "SIMULATION_DIRECTION_CONTRADICTORY",
        "BLOCK",
        "Predicted wallet balance changes contradict the expected USDT-out / wrapper-in direction.",
      ),
    );
  } else if (
    params.simulationState === "SUCCESS" &&
    params.simulationDirection === "INCOMPLETE"
  ) {
    reasons.push(
      reason(
        "SIMULATION_DIRECTION_INCOMPLETE",
        "REVIEW",
        "Simulation succeeded but did not expose both expected wallet balance deltas, so direction evidence is incomplete.",
      ),
    );
  }

  if (!params.reverseQuoteAvailable && params.quoteAvailable) {
    reasons.push(
      reason(
        "EXIT_ROUTE_UNOBSERVED",
        "REVIEW",
        "Entry liquidity exists, but Underly could not observe a full synthetic reverse route for the quoted output.",
      ),
    );
  }
  if (params.integrityStatus === "BLOCKED") {
    reasons.push(
      reason(
        "INTEGRITY_BLOCKED",
        "BLOCK",
        "Current wrapper integrity evidence is blocked.",
      ),
    );
  } else if (params.integrityStatus === "NOT_APPLICABLE") {
    reasons.push(
      reason(
        "INTEGRITY_NOT_APPLICABLE",
        "REVIEW",
        "Current wrapper integrity evidence is not applicable to this snapshot.",
      ),
    );
  } else if (params.integrityStatus === "WARN") {
    reasons.push(
      reason(
        "INTEGRITY_WARNING",
        "REVIEW",
        "Current wrapper integrity evidence contains an explicit warning.",
      ),
    );
  } else if (params.integrityStatus === "UNKNOWN") {
    reasons.push(
      reason(
        "INTEGRITY_INCOMPLETE",
        "REVIEW",
        "Current wrapper integrity evidence is incomplete.",
      ),
    );
  }

  if (params.tradingAvailable === false) {
    reasons.push(
      reason(
        "UNDERLYING_SESSION_CLOSED",
        "REVIEW",
        "The underlying market session is currently closed. Tokenized-equity liquidity may remain available, but reference formation is not the same as an open underlying session.",
      ),
    );
  } else if (params.tradingAvailable === null) {
    reasons.push(
      reason(
        "UNDERLYING_SESSION_UNKNOWN",
        "REVIEW",
        "The current underlying-session state is unavailable.",
      ),
    );
  }

  if (reasons.some((item) => item.severity === "BLOCK")) {
    return { status: "BLOCKED", reasons };
  }

  if (reasons.some((item) => item.severity === "REVIEW")) {
    return { status: "REVIEW", reasons };
  }

  return {
    status: "READY",
    reasons: [
      reason(
        "PREFLIGHT_CLEAR",
        "INFO",
        "Current economic, integrity, ActionGuard, liquidity, and wallet-simulation checks are clear for this snapshot.",
      ),
    ],
  };
}

export function overallPreflightStatus(
  statuses: PreflightDecisionStatus[],
): PreflightDecisionStatus {
  if (statuses.includes("READY")) return "READY";
  if (statuses.includes("REVIEW")) return "REVIEW";
  return "BLOCKED";
}
