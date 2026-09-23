import Decimal from "decimal.js";

import type {
  PreflightDecisionStatus,
  PreflightSimulationState,
  SimulationDirectionState,
} from "./preflight";
import {
  canonicalSerialize,
  sha256Calldata,
  sha256Text,
} from "./approval-digest";

export type ExecutionReadinessStatus =
  | "EXECUTION_READY"
  | "REVIEW"
  | "BLOCKED";

export interface ExecutionReadinessReason {
  code: string;
  severity: "BLOCK" | "REVIEW" | "INFO";
  message: string;
}

export interface ApprovalIntent {
  chainId: string;
  walletAddress: string;
  ticker: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountRaw: string;
  quotedOutputAmountRaw: string;
  minimumReceiveAmountRaw: string;
  quoteId: string;
  slippagePercent: string;
  callFrom: string;
  callTarget: string;
  callValue: string;
  allowanceTokenAddress: string;
  allowanceSpenderAddress: string;
  maximumAllowanceDecreaseRaw: string;
  callDataHash: string;
  snapshotTimestamp: string;
  expiresAt: string;
}

export interface ApprovalEnvelope {
  version: "underly-call-intent-v1";
  scope: "EVM_CALL_INTENT_ONLY";
  intent: ApprovalIntent;
  digest: string;
  humanApprovalRequired: true;
  finalTransactionApprovalRequired: true;
  nonceBound: false;
  gasBound: false;
  feesBound: false;
  signatureRequested: false;
  transactionBroadcast: false;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const HASH = /^[a-f0-9]{64}$/;
const PreciseDecimal = Decimal.clone({ precision: 80 });

function canonicalAddress(value: string, field: string): string {
  const normalized = normalizeAddress(value);
  if (!EVM_ADDRESS.test(normalized) || normalized === ZERO_ADDRESS) {
    throw new Error(`${field} must be a nonzero EVM address`);
  }
  return normalized;
}

function canonicalUint(value: string, field: string, positive = false): string {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    throw new Error(`${field} must be an unsigned integer string`);
  }
  const canonical = BigInt(trimmed).toString();
  if (positive && canonical === "0") {
    throw new Error(`${field} must be greater than zero`);
  }
  return canonical;
}

function canonicalDecimal(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`${field} must be a non-negative decimal string`);
  }
  const parsed = new PreciseDecimal(trimmed);
  if (!parsed.isFinite() || parsed.lt(0)) {
    throw new Error(`${field} must be finite and non-negative`);
  }
  return parsed.toFixed();
}

function canonicalTimestamp(value: string, field: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

export interface ApprovalEnvelopeInput
  extends Omit<
    ApprovalIntent,
    | "callDataHash"
    | "allowanceTokenAddress"
    | "allowanceSpenderAddress"
    | "maximumAllowanceDecreaseRaw"
  > {
  callData: string;
}

function canonicalIntent(input: ApprovalEnvelopeInput): ApprovalIntent {
  const ticker = input.ticker.trim().toUpperCase();
  const quoteId = input.quoteId.trim();
  if (!ticker || ticker.length > 20) throw new Error("ticker is invalid");
  if (!quoteId) throw new Error("quoteId must not be empty");

  const snapshotTimestamp = canonicalTimestamp(
    input.snapshotTimestamp,
    "snapshotTimestamp",
  );
  const expiresAt = canonicalTimestamp(input.expiresAt, "expiresAt");
  if (Date.parse(snapshotTimestamp) >= Date.parse(expiresAt)) {
    throw new Error("expiresAt must be later than snapshotTimestamp");
  }

  const walletAddress = canonicalAddress(input.walletAddress, "walletAddress");
  const callFrom = canonicalAddress(input.callFrom, "callFrom");
  if (callFrom !== walletAddress) {
    throw new Error("callFrom must match walletAddress");
  }

  const quotedOutputAmountRaw = canonicalUint(
    input.quotedOutputAmountRaw,
    "quotedOutputAmountRaw",
    true,
  );
  const minimumReceiveAmountRaw = canonicalUint(
    input.minimumReceiveAmountRaw,
    "minimumReceiveAmountRaw",
    true,
  );
  if (BigInt(minimumReceiveAmountRaw) > BigInt(quotedOutputAmountRaw)) {
    throw new Error("minimumReceiveAmountRaw exceeds quotedOutputAmountRaw");
  }
  const slippagePercent = canonicalDecimal(
    input.slippagePercent,
    "slippagePercent",
  );
  if (
    new PreciseDecimal(slippagePercent).lte(0) ||
    new PreciseDecimal(slippagePercent).gt(100)
  ) {
    throw new Error("slippagePercent must be greater than zero and at most 100");
  }

  const fromTokenAddress = canonicalAddress(
    input.fromTokenAddress,
    "fromTokenAddress",
  );
  const toTokenAddress = canonicalAddress(
    input.toTokenAddress,
    "toTokenAddress",
  );
  if (fromTokenAddress === toTokenAddress) {
    throw new Error("fromTokenAddress and toTokenAddress must differ");
  }

  const amountRaw = canonicalUint(input.amountRaw, "amountRaw", true);
  const callTarget = canonicalAddress(input.callTarget, "callTarget");

  return {
    chainId: canonicalUint(input.chainId, "chainId", true),
    walletAddress,
    ticker,
    fromTokenAddress,
    toTokenAddress,
    amountRaw,
    quotedOutputAmountRaw,
    minimumReceiveAmountRaw,
    quoteId,
    slippagePercent,
    callFrom,
    callTarget,
    callValue: canonicalUint(input.callValue, "callValue"),
    allowanceTokenAddress: fromTokenAddress,
    allowanceSpenderAddress: callTarget,
    maximumAllowanceDecreaseRaw: amountRaw,
    callDataHash: sha256Calldata(input.callData),
    snapshotTimestamp,
    expiresAt,
  };
}

export function isCanonicalApprovalIntent(value: unknown): value is ApprovalIntent {
  if (!value || typeof value !== "object") return false;
  const intent = value as Record<string, unknown>;
  try {
    const canonical = canonicalIntent({
      chainId: String(intent.chainId ?? ""),
      walletAddress: String(intent.walletAddress ?? ""),
      ticker: String(intent.ticker ?? ""),
      fromTokenAddress: String(intent.fromTokenAddress ?? ""),
      toTokenAddress: String(intent.toTokenAddress ?? ""),
      amountRaw: String(intent.amountRaw ?? ""),
      quotedOutputAmountRaw: String(intent.quotedOutputAmountRaw ?? ""),
      minimumReceiveAmountRaw: String(intent.minimumReceiveAmountRaw ?? ""),
      quoteId: String(intent.quoteId ?? ""),
      slippagePercent: String(intent.slippagePercent ?? ""),
      callFrom: String(intent.callFrom ?? ""),
      callTarget: String(intent.callTarget ?? ""),
      callValue: String(intent.callValue ?? ""),
      callData: "0x00",
      snapshotTimestamp: String(intent.snapshotTimestamp ?? ""),
      expiresAt: String(intent.expiresAt ?? ""),
    });
    const canonicalWithoutHash: Record<string, unknown> = { ...canonical };
    delete canonicalWithoutHash.callDataHash;
    const candidateWithoutHash: Record<string, unknown> = { ...intent };
    const callDataHash = candidateWithoutHash.callDataHash;
    delete candidateWithoutHash.callDataHash;
    return (
      typeof callDataHash === "string" &&
      HASH.test(callDataHash) &&
      canonicalSerialize(candidateWithoutHash) ===
        canonicalSerialize(canonicalWithoutHash)
    );
  } catch {
    return false;
  }
}

export function computeApprovalDigest(intent: ApprovalIntent): string {
  if (!isCanonicalApprovalIntent(intent)) {
    throw new Error("approval intent is not canonical");
  }
  return sha256Text(
    canonicalSerialize({
      version: "underly-call-intent-v1",
      scope: "EVM_CALL_INTENT_ONLY",
      intent,
    }),
  );
}

export function buildApprovalEnvelope(
  input: ApprovalEnvelopeInput,
): ApprovalEnvelope {
  const canonical = canonicalIntent(input);
  const digest = computeApprovalDigest(canonical);

  return {
    version: "underly-call-intent-v1",
    scope: "EVM_CALL_INTENT_ONLY",
    intent: canonical,
    digest,
    humanApprovalRequired: true,
    finalTransactionApprovalRequired: true,
    nonceBound: false,
    gasBound: false,
    feesBound: false,
    signatureRequested: false,
    transactionBroadcast: false,
  };
}

export function isReadinessSnapshotFresh(params: {
  snapshotTimestamp: string;
  expiresAt: string;
  now?: Date;
}): boolean {
  const snapshotMs = Date.parse(params.snapshotTimestamp);
  const expiresMs = Date.parse(params.expiresAt);
  const nowMs = (params.now ?? new Date()).getTime();

  return (
    Number.isFinite(snapshotMs) &&
    Number.isFinite(expiresMs) &&
    snapshotMs <= nowMs &&
    snapshotMs < expiresMs &&
    nowMs < expiresMs
  );
}

export interface ExecutionSimulationBalanceChange {
  contractAddress?: string | null;
  tokenType?: string | null;
  change?: string | null;
  owner?: string | null;
}

export interface ExecutionSimulationAllowanceChange {
  tokenAddress?: string | null;
  owner?: string | null;
  spender?: string | null;
  preAmount?: string | null;
  postAmount?: string | null;
}

export interface ExecutionSimulationEvidence {
  state: SimulationDirectionState;
  reason: string | null;
  spendTokenDelta: string | null;
  receiveTokenDelta: string | null;
}

function signedRaw(value?: string | null): bigint | null {
  if (!value || !/^-?[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function simulationAddress(value?: string | null): string | null {
  if (!value || !EVM_ADDRESS.test(value.trim())) return null;
  return normalizeAddress(value);
}

export function inspectExecutionSimulationEffects(params: {
  changes: ExecutionSimulationBalanceChange[] | null;
  allowanceChanges: ExecutionSimulationAllowanceChange[] | null;
  walletAddress: string;
  spendTokenAddress: string;
  receiveTokenAddress: string;
  expectedSpendAmountRaw: string;
  minimumReceiveAmountRaw: string;
  expectedAllowanceSpenderAddress: string;
}): ExecutionSimulationEvidence {
  if (!Array.isArray(params.changes) || !Array.isArray(params.allowanceChanges)) {
    return {
      state: "INCOMPLETE",
      reason: "SIMULATION_EFFECT_EVIDENCE_MISSING",
      spendTokenDelta: null,
      receiveTokenDelta: null,
    };
  }

  const wallet = normalizeAddress(params.walletAddress);
  const spend = normalizeAddress(params.spendTokenAddress);
  const receive = normalizeAddress(params.receiveTokenAddress);
  const expectedSpend = BigInt(params.expectedSpendAmountRaw);
  const minimumReceive = BigInt(params.minimumReceiveAmountRaw);
  const expectedAllowanceSpender = normalizeAddress(
    params.expectedAllowanceSpenderAddress,
  );
  let spendDelta = 0n;
  let receiveDelta = 0n;
  let sawSpend = false;
  let sawReceive = false;
  let allowanceDecrease = 0n;
  let sawAllowanceMutation = false;

  for (const change of params.changes) {
    const amount = signedRaw(change.change);
    const owner = simulationAddress(change.owner);
    if (amount === null || owner === null) {
      return {
        state: "INCOMPLETE",
        reason: "SIMULATION_BALANCE_CHANGE_MALFORMED",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
    if (owner !== wallet || amount === 0n) continue;

    const tokenType = (change.tokenType ?? "").trim().toUpperCase();
    const contract = simulationAddress(change.contractAddress);
    const nativeAsset =
      !contract ||
      contract === ZERO_ADDRESS ||
      tokenType.includes("NATIVE");

    if (nativeAsset) {
      if (amount < 0n) {
        return {
          state: "CONTRADICTORY",
          reason: "UNEXPECTED_NATIVE_ASSET_DEBIT",
          spendTokenDelta: sawSpend ? spendDelta.toString() : null,
          receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
        };
      }
      continue;
    }

    if (tokenType && tokenType !== "ERC20") {
      return {
        state: "INCOMPLETE",
        reason: "SIMULATION_TOKEN_TYPE_UNVERIFIED",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }

    if (contract === spend) {
      if (amount > 0n) {
        return {
          state: "CONTRADICTORY",
          reason: "UNEXPECTED_SPEND_TOKEN_CREDIT",
          spendTokenDelta: spendDelta.toString(),
          receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
        };
      }
      spendDelta += amount;
      sawSpend = true;
      continue;
    }

    if (contract === receive) {
      if (amount < 0n) {
        return {
          state: "CONTRADICTORY",
          reason: "UNEXPECTED_RECEIVE_TOKEN_DEBIT",
          spendTokenDelta: sawSpend ? spendDelta.toString() : null,
          receiveTokenDelta: receiveDelta.toString(),
        };
      }
      receiveDelta += amount;
      sawReceive = true;
      continue;
    }

    if (amount < 0n) {
      return {
        state: "CONTRADICTORY",
        reason: "UNEXPECTED_WALLET_TOKEN_DEBIT",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
  }

  for (const allowance of params.allowanceChanges) {
    const owner = simulationAddress(allowance.owner);
    const token = simulationAddress(allowance.tokenAddress);
    const spender = simulationAddress(allowance.spender);
    const preAmount = signedRaw(allowance.preAmount);
    const postAmount = signedRaw(allowance.postAmount);
    if (
      owner === null ||
      token === null ||
      spender === null ||
      preAmount === null ||
      postAmount === null ||
      preAmount < 0n ||
      postAmount < 0n
    ) {
      return {
        state: "INCOMPLETE",
        reason: "SIMULATION_ALLOWANCE_CHANGE_MALFORMED",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
    if (owner !== wallet || preAmount === postAmount) continue;
    if (token !== spend || spender !== expectedAllowanceSpender) {
      return {
        state: "CONTRADICTORY",
        reason: "UNEXPECTED_ALLOWANCE_MUTATION",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
    if (postAmount > preAmount) {
      return {
        state: "CONTRADICTORY",
        reason: "ALLOWANCE_INCREASE_NOT_ALLOWED",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
    if (sawAllowanceMutation) {
      return {
        state: "CONTRADICTORY",
        reason: "MULTIPLE_ALLOWANCE_MUTATIONS",
        spendTokenDelta: sawSpend ? spendDelta.toString() : null,
        receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
      };
    }
    allowanceDecrease = preAmount - postAmount;
    sawAllowanceMutation = true;
  }

  if (sawAllowanceMutation && allowanceDecrease !== expectedSpend) {
    return {
      state: "CONTRADICTORY",
      reason: "ALLOWANCE_DECREASE_MISMATCH",
      spendTokenDelta: sawSpend ? spendDelta.toString() : null,
      receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
    };
  }

  if (!sawSpend || !sawReceive) {
    return {
      state: "INCOMPLETE",
      reason: "EXPECTED_BALANCE_CHANGE_MISSING",
      spendTokenDelta: sawSpend ? spendDelta.toString() : null,
      receiveTokenDelta: sawReceive ? receiveDelta.toString() : null,
    };
  }
  if (spendDelta !== -expectedSpend) {
    return {
      state: "CONTRADICTORY",
      reason: "SPEND_AMOUNT_MISMATCH",
      spendTokenDelta: spendDelta.toString(),
      receiveTokenDelta: receiveDelta.toString(),
    };
  }
  if (receiveDelta < minimumReceive) {
    return {
      state: "CONTRADICTORY",
      reason: "RECEIVE_AMOUNT_BELOW_MINIMUM",
      spendTokenDelta: spendDelta.toString(),
      receiveTokenDelta: receiveDelta.toString(),
    };
  }

  return {
    state: "VERIFIED",
    reason: null,
    spendTokenDelta: spendDelta.toString(),
    receiveTokenDelta: receiveDelta.toString(),
  };
}

export function classifyExecutionReadiness(params: {
  preflightStatus: PreflightDecisionStatus;
  quoteAvailable: boolean;
  quoteIdAvailable: boolean;
  buildAvailable: boolean;
  unsignedBuildAvailable?: boolean;
  buildValidationReason?: string | null;
  simulationState: PreflightSimulationState;
  simulationDirection: SimulationDirectionState;
  snapshotFresh?: boolean;
}): {
  status: ExecutionReadinessStatus;
  reasons: ExecutionReadinessReason[];
  humanApprovalRequired: true;
  humanApprovalRequested: false;
  executionPermitted: false;
} {
  const reasons: ExecutionReadinessReason[] = [];

  if (params.preflightStatus === "BLOCKED") {
    reasons.push({
      code: "PREFLIGHT_BLOCKED",
      severity: "BLOCK",
      message:
        "The fresh Underly preflight contains a blocking condition.",
    });
  } else if (params.preflightStatus === "REVIEW") {
    reasons.push({
      code: "PREFLIGHT_REVIEW_REQUIRED",
      severity: "REVIEW",
      message:
        "The fresh Underly preflight still requires human review.",
    });
  }

  if (!params.quoteAvailable) {
    reasons.push({
      code: "FRESH_QUOTE_UNAVAILABLE",
      severity: "BLOCK",
      message:
        "No current executable quote exists for the selected representation.",
    });
  }

  if (!params.quoteIdAvailable) {
    reasons.push({
      code: "QUOTE_ID_UNAVAILABLE",
      severity: "BLOCK",
      message:
        "The current route does not expose a quote identifier that can bind an approval to this exact route.",
    });
  }

  if (!params.buildAvailable) {
    if (
      params.unsignedBuildAvailable &&
      params.buildValidationReason === "BUILD_QUOTE_ID_UNCONFIRMED"
    ) {
      reasons.push({
        code: "BUILD_QUOTE_ID_UNCONFIRMED",
        severity: "BLOCK",
        message:
          "Binance returned an unsigned build, but its response did not return the quote ID needed to independently bind that build to the selected quote.",
      });
    } else {
      reasons.push({
        code: "UNSIGNED_BUILD_UNAVAILABLE",
        severity: "BLOCK",
        message:
          "An unsigned transaction build is unavailable or cannot be safely assessed for the selected route.",
      });
    }
  }

  if (params.snapshotFresh === false) {
    reasons.push({
      code: "SNAPSHOT_EXPIRED",
      severity: "BLOCK",
      message:
        "The local readiness snapshot expired before it could be presented.",
    });
  }

  if (params.simulationState === "ALLOWANCE_REQUIRED") {
    reasons.push({
      code: "ALLOWANCE_REQUIRED",
      severity: "REVIEW",
      message:
        "ERC-20 allowance must be handled before this route can become execution-ready.",
    });
  } else if (params.simulationState !== "SUCCESS") {
    reasons.push({
      code: "SIMULATION_NOT_CLEAR",
      severity: "BLOCK",
      message:
        "The unsigned transaction does not have a clear successful simulation.",
    });
  }

  if (params.simulationDirection === "CONTRADICTORY") {
    reasons.push({
      code: "SIMULATION_DIRECTION_CONTRADICTORY",
      severity: "BLOCK",
      message:
        "Predicted wallet balance changes contradict the selected route.",
    });
  } else if (
    params.simulationState === "SUCCESS" &&
    params.simulationDirection !== "VERIFIED"
  ) {
    reasons.push({
      code: "SIMULATION_DIRECTION_UNVERIFIED",
      severity: "REVIEW",
      message:
        "Simulation succeeded but the expected wallet balance direction is not fully verified.",
    });
  }

  if (reasons.some((item) => item.severity === "BLOCK")) {
    return {
      status: "BLOCKED",
      reasons,
      humanApprovalRequired: true,
      humanApprovalRequested: false,
      executionPermitted: false,
    };
  }

  if (reasons.some((item) => item.severity === "REVIEW")) {
    return {
      status: "REVIEW",
      reasons,
      humanApprovalRequired: true,
      humanApprovalRequested: false,
      executionPermitted: false,
    };
  }

  return {
    status: "EXECUTION_READY",
    reasons: [
      {
        code: "READY_FOR_HUMAN_APPROVAL",
        severity: "INFO",
        message:
          "The selected route has a fresh quote, unsigned build, and verified successful simulation. Explicit human approval is still required.",
      },
    ],
    humanApprovalRequired: true,
    humanApprovalRequested: false,
    executionPermitted: false,
  };
}
