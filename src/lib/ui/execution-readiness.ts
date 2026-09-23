import { z } from "zod";

import {
  computeApprovalDigest,
  isCanonicalApprovalIntent,
  type ApprovalIntent,
} from "@/lib/underly/execution-readiness";

export type ExecutionReadinessStatus =
  | "EXECUTION_READY"
  | "REVIEW"
  | "BLOCKED";

export type ReadinessDisplayStatus =
  | ExecutionReadinessStatus
  | "STALE / RECHECK REQUIRED";

export type ExecutionReadinessForm = {
  wrapperContractAddress: string;
  walletAddress: string;
  amountUsdt: string;
  slippagePercent: string;
  maxReferenceGapPct: string;
};

export type ExecutionReadinessRequest = {
  ticker: string;
  wrapperContractAddress: string;
  walletAddress: string;
  amountRaw: string;
  slippagePercent: string;
  maxReferenceGapPct?: string;
};

export type ExecutionReadinessReason = {
  code: string;
  severity: "BLOCK" | "REVIEW" | "INFO";
  message: string;
};

type ApprovalEnvelope = {
  version: "underly-call-intent-v1";
  scope: "EVM_CALL_INTENT_ONLY";
  digest: string;
  humanApprovalRequired: true;
  finalTransactionApprovalRequired: true;
  nonceBound: false;
  gasBound: false;
  feesBound: false;
  signatureRequested: false;
  transactionBroadcast: false;
  intent: ApprovalIntent;
};

export type ExecutionReadinessResponse = {
  version: string;
  executionReadinessStatus: ExecutionReadinessStatus;
  snapshotTimestamp: string;
  expiresAt: string;
  snapshotFresh: boolean;
  request: {
    ticker: string;
    wrapperContractAddress: string;
    walletAddress: string;
    inputTokenAddress: string;
    amountRaw: string;
    amountUsdt: string;
    maxReferenceGapPct: string | null;
    slippagePercent: string;
  };
  selectedWrapper: {
    chainId: string;
    ticker: string;
    provider: string;
    symbol: string;
    contractAddress: string;
  };
  economicExposure: {
    tokenPriceUsd: string | null;
    referencePriceUsd: string | null;
    tokenShareRatio: string | null;
    shareEquivalentPriceUsd: string | null;
    referenceGapPct: string | null;
    quotedTokenAmount: string | null;
    quotedUnderlyingShares: string | null;
    quotedReferenceValueUsd: string | null;
  };
  integrity: {
    status: "PASS" | "WARN" | "UNKNOWN";
    dataCompleteness: "COMPLETE" | "PARTIAL";
  };
  corporateActions: {
    status: "CLEAR" | "ACTIVE" | "UNKNOWN";
  };
  quote: {
    available: boolean;
    quoteId: string | null;
    vendor: string | null;
    executionMode: string | null;
    inputAmountRaw: string;
    outputAmountRaw: string | null;
    priceImpactPercent: string | null;
    reverse: {
      available: boolean;
      vendor: string | null;
      recoveredUsdt: string | null;
      upstreamCode: number | null;
      upstreamMessage: string | null;
    };
  };
  build: {
    available: boolean;
    identityBindingConfirmed: boolean;
    validationReason: string | null;
    upstreamCode: number | null;
    upstreamMessage: string | null;
    executionMode: string | null;
    transactionTarget: string | null;
    minimumReceiveAmountRaw: string | null;
    calldataReturned: false;
    rawTransactionReturned: false;
  };
  simulation: {
    state: string;
    direction: string;
    failReason: string | null;
    effectValidationReason: string | null;
  };
  readiness: {
    status: ExecutionReadinessStatus;
    reasons: ExecutionReadinessReason[];
    humanApprovalRequired: true;
    humanApprovalRequested: false;
    executionPermitted: false;
  };
  approvalEnvelope: ApprovalEnvelope | null;
  methodology: {
    assessmentScope: string;
    simulationLimit: string;
    approvalBinding: string;
    expiration: string;
  };
  humanApprovalRequired: true;
  humanApprovalRequested: false;
  approvalAuthorizationGranted: false;
  executionPermitted: false;
  signatureRequested: false;
  transactionBroadcast: false;
  rawTransactionReturned: false;
  privateKeyRequired: false;
};

export type ReadinessUiError = {
  kind: "INVALID REQUEST" | "UPSTREAM FAILURE" | "NETWORK FAILURE";
  message: string;
};

export type ExecutionReadinessUiState = {
  form: ExecutionReadinessForm;
  activeRequestId: number | null;
  loading: boolean;
  result: ExecutionReadinessResponse | null;
  error: ReadinessUiError | null;
};

export type ExecutionReadinessUiAction =
  | {
      type: "inputChanged";
      field: keyof ExecutionReadinessForm;
      value: string;
    }
  | { type: "tickerChanged" }
  | { type: "requestStarted"; requestId: number }
  | {
      type: "requestSucceeded";
      requestId: number;
      result: ExecutionReadinessResponse;
    }
  | {
      type: "requestFailed";
      requestId: number;
      error: ReadinessUiError;
    }
  | { type: "validationFailed"; error: ReadinessUiError };

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DECIMAL = /^\d+(?:\.\d+)?$/;
const UINT = /^[0-9]+$/;
const HASH = /^[a-f0-9]{64}$/;
const BSC_CHAIN_ID = "56";
const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";

const NullableString = z.string().nullable();
const Address = z.string().regex(EVM_ADDRESS);
const ReasonSchema = z.object({
  code: z.string(),
  severity: z.enum(["BLOCK", "REVIEW", "INFO"]),
  message: z.string(),
});
const ApprovalIntentSchema = z.object({
  chainId: z.string(),
  walletAddress: Address,
  ticker: z.string(),
  fromTokenAddress: Address,
  toTokenAddress: Address,
  amountRaw: z.string().regex(UINT),
  quotedOutputAmountRaw: z.string().regex(UINT),
  minimumReceiveAmountRaw: z.string().regex(UINT),
  quoteId: z.string().min(1),
  slippagePercent: z.string(),
  callFrom: Address,
  callTarget: Address,
  callValue: z.string().regex(UINT),
  allowanceTokenAddress: Address,
  allowanceSpenderAddress: Address,
  maximumAllowanceDecreaseRaw: z.string().regex(UINT),
  callDataHash: z.string().regex(HASH),
  snapshotTimestamp: z.string(),
  expiresAt: z.string(),
}).strict();
const ApprovalEnvelopeSchema = z.object({
  version: z.literal("underly-call-intent-v1"),
  scope: z.literal("EVM_CALL_INTENT_ONLY"),
  digest: z.string().regex(HASH),
  humanApprovalRequired: z.literal(true),
  finalTransactionApprovalRequired: z.literal(true),
  nonceBound: z.literal(false),
  gasBound: z.literal(false),
  feesBound: z.literal(false),
  signatureRequested: z.literal(false),
  transactionBroadcast: z.literal(false),
  intent: ApprovalIntentSchema,
}).strict();

const ExecutionReadinessResponseSchema = z.object({
  version: z.literal("0.6-B"),
  executionReadinessStatus: z.enum(["EXECUTION_READY", "REVIEW", "BLOCKED"]),
  snapshotTimestamp: z.string(),
  expiresAt: z.string(),
  snapshotFresh: z.boolean(),
  request: z.object({
    ticker: z.string(),
    wrapperContractAddress: Address,
    walletAddress: Address,
    inputTokenAddress: Address,
    amountRaw: z.string().regex(UINT),
    amountUsdt: z.string(),
    maxReferenceGapPct: NullableString,
    slippagePercent: z.string(),
  }).passthrough(),
  selectedWrapper: z.object({
    chainId: z.string(),
    ticker: z.string(),
    provider: z.string(),
    symbol: z.string(),
    contractAddress: Address,
  }).passthrough(),
  economicExposure: z.object({
    tokenPriceUsd: NullableString,
    referencePriceUsd: NullableString,
    tokenShareRatio: NullableString,
    shareEquivalentPriceUsd: NullableString,
    referenceGapPct: NullableString,
    quotedTokenAmount: NullableString,
    quotedUnderlyingShares: NullableString,
    quotedReferenceValueUsd: NullableString,
  }).passthrough(),
  integrity: z.object({
    status: z.enum(["PASS", "WARN", "UNKNOWN"]),
    dataCompleteness: z.enum(["COMPLETE", "PARTIAL"]),
  }).passthrough(),
  corporateActions: z.object({
    status: z.enum(["CLEAR", "ACTIVE", "UNKNOWN"]),
  }).passthrough(),
  quote: z.object({
    available: z.boolean(),
    quoteId: NullableString,
    vendor: NullableString,
    executionMode: NullableString,
    inputAmountRaw: z.string(),
    outputAmountRaw: NullableString,
    priceImpactPercent: NullableString,
    reverse: z.object({
      available: z.boolean(),
      vendor: NullableString,
      recoveredUsdt: NullableString,
      upstreamCode: z.number().nullable(),
      upstreamMessage: NullableString,
    }).passthrough(),
  }).passthrough(),
  build: z.object({
    available: z.boolean(),
    identityBindingConfirmed: z.boolean(),
    validationReason: NullableString,
    upstreamCode: z.number().nullable(),
    upstreamMessage: NullableString,
    executionMode: NullableString,
    transactionTarget: z.union([Address, z.null()]),
    minimumReceiveAmountRaw: z.string().regex(UINT).nullable(),
    calldataReturned: z.literal(false),
    rawTransactionReturned: z.literal(false),
  }).passthrough(),
  simulation: z.object({
    state: z.string(),
    direction: z.string(),
    failReason: NullableString,
    effectValidationReason: NullableString,
  }).passthrough(),
  readiness: z.object({
    status: z.enum(["EXECUTION_READY", "REVIEW", "BLOCKED"]),
    reasons: z.array(ReasonSchema),
    humanApprovalRequired: z.literal(true),
    humanApprovalRequested: z.literal(false),
    executionPermitted: z.literal(false),
  }).passthrough(),
  approvalEnvelope: ApprovalEnvelopeSchema.nullable(),
  methodology: z.object({
    assessmentScope: z.string(),
    simulationLimit: z.string(),
    approvalBinding: z.string(),
    expiration: z.string(),
  }).passthrough(),
  humanApprovalRequired: z.literal(true),
  humanApprovalRequested: z.literal(false),
  approvalAuthorizationGranted: z.literal(false),
  executionPermitted: z.literal(false),
  signatureRequested: z.literal(false),
  transactionBroadcast: z.literal(false),
  rawTransactionReturned: z.literal(false),
  privateKeyRequired: z.literal(false),
}).passthrough();

export function parseExecutionReadinessResponse(
  value: unknown,
): ExecutionReadinessResponse | null {
  const parsed = ExecutionReadinessResponseSchema.safeParse(value);
  return parsed.success ? (parsed.data as ExecutionReadinessResponse) : null;
}

export function initialExecutionReadinessUiState(): ExecutionReadinessUiState {
  return {
    form: {
      wrapperContractAddress: "",
      walletAddress: "",
      amountUsdt: "25",
      slippagePercent: "0.5",
      maxReferenceGapPct: "",
    },
    activeRequestId: null,
    loading: false,
    result: null,
    error: null,
  };
}

export function executionReadinessUiReducer(
  state: ExecutionReadinessUiState,
  action: ExecutionReadinessUiAction,
): ExecutionReadinessUiState {
  switch (action.type) {
    case "inputChanged":
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
        activeRequestId: null,
        loading: false,
        result: null,
        error: null,
      };
    case "tickerChanged":
      return {
        ...initialExecutionReadinessUiState(),
        form: {
          ...state.form,
          wrapperContractAddress: "",
        },
      };
    case "requestStarted":
      return {
        ...state,
        activeRequestId: action.requestId,
        loading: true,
        result: null,
        error: null,
      };
    case "requestSucceeded":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        activeRequestId: null,
        loading: false,
        result: action.result,
        error: null,
      };
    case "requestFailed":
      if (state.activeRequestId !== action.requestId) return state;
      return {
        ...state,
        activeRequestId: null,
        loading: false,
        result: null,
        error: action.error,
      };
    case "validationFailed":
      return {
        ...state,
        activeRequestId: null,
        loading: false,
        result: null,
        error: action.error,
      };
  }
}

export function usdtAmountToRaw(value: string): string {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(trimmed)) {
    throw new Error("USDT amount must be a positive decimal number.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > 18) {
    throw new Error("USDT amount supports at most 18 decimal places.");
  }

  const raw = BigInt(`${whole}${fraction.padEnd(18, "0")}`).toString();
  if (raw === "0") {
    throw new Error("USDT amount must be greater than zero.");
  }
  return raw;
}

function validNonZeroAddress(value: string): boolean {
  return EVM_ADDRESS.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export function buildExecutionReadinessRequest(
  ticker: string,
  form: ExecutionReadinessForm,
): ExecutionReadinessRequest {
  const wrapperContractAddress = form.wrapperContractAddress.trim();
  const walletAddress = form.walletAddress.trim();
  const slippagePercent = form.slippagePercent.trim();
  const maxReferenceGapPct = form.maxReferenceGapPct.trim();

  if (!wrapperContractAddress) {
    throw new Error("Select the exact BSC wrapper to inspect.");
  }
  if (!validNonZeroAddress(wrapperContractAddress)) {
    throw new Error("The selected wrapper address is invalid.");
  }
  if (!validNonZeroAddress(walletAddress)) {
    throw new Error("Enter a valid public EVM wallet address.");
  }
  if (
    !DECIMAL.test(slippagePercent) ||
    Number(slippagePercent) <= 0 ||
    Number(slippagePercent) > 5
  ) {
    throw new Error("Slippage tolerance must be greater than 0% and at most 5%.");
  }
  if (
    maxReferenceGapPct &&
    (!DECIMAL.test(maxReferenceGapPct) || Number(maxReferenceGapPct) < 0)
  ) {
    throw new Error("Maximum reference gap must be a non-negative percentage.");
  }

  return {
    ticker: ticker.trim().toUpperCase(),
    wrapperContractAddress,
    walletAddress,
    amountRaw: usdtAmountToRaw(form.amountUsdt),
    slippagePercent,
    ...(maxReferenceGapPct ? { maxReferenceGapPct } : {}),
  };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function describeBuildBinding(build: {
  available: boolean;
  identityBindingConfirmed: boolean;
  validationReason: string | null;
}): { label: string; detail: string } {
  if (build.identityBindingConfirmed) {
    return {
      label: "CONFIRMED",
      detail: "The response-side build evidence matches the selected quote.",
    };
  }
  if (
    build.available &&
    build.validationReason === "BUILD_QUOTE_ID_UNCONFIRMED"
  ) {
    return {
      label: "QUOTE/BUILD BINDING UNCONFIRMED",
      detail:
        "Binance returned an unsigned build but did not return a response-side quote ID. The build can be assessed and simulated, but it cannot become execution-ready.",
    };
  }
  return {
    label: build.available ? "UNCONFIRMED" : "UNAVAILABLE",
    detail: build.validationReason
      ? `Build validation stopped with ${build.validationReason}.`
      : "No safely assessable unsigned build is available.",
  };
}

function validApprovalEnvelope(result: ExecutionReadinessResponse): boolean {
  const envelope = result.approvalEnvelope;
  if (!envelope) return false;
  try {
    const { intent } = envelope;
    return (
      envelope.version === "underly-call-intent-v1" &&
      envelope.scope === "EVM_CALL_INTENT_ONLY" &&
      envelope.humanApprovalRequired === true &&
      envelope.finalTransactionApprovalRequired === true &&
      envelope.nonceBound === false &&
      envelope.gasBound === false &&
      envelope.feesBound === false &&
      envelope.signatureRequested === false &&
      envelope.transactionBroadcast === false &&
      isCanonicalApprovalIntent(intent) &&
      computeApprovalDigest(intent) === envelope.digest &&
      intent.chainId === result.selectedWrapper.chainId &&
      intent.chainId === BSC_CHAIN_ID &&
      intent.ticker === result.request.ticker &&
      result.selectedWrapper.ticker === result.request.ticker &&
      sameAddress(
        result.request.wrapperContractAddress,
        result.selectedWrapper.contractAddress,
      ) &&
      sameAddress(intent.walletAddress, result.request.walletAddress) &&
      sameAddress(intent.callFrom, result.request.walletAddress) &&
      sameAddress(intent.fromTokenAddress, result.request.inputTokenAddress) &&
      sameAddress(intent.fromTokenAddress, BSC_USDT) &&
      sameAddress(intent.toTokenAddress, result.selectedWrapper.contractAddress) &&
      intent.amountRaw === result.request.amountRaw &&
      result.quote.available === true &&
      result.quote.inputAmountRaw === result.request.amountRaw &&
      intent.quoteId === result.quote.quoteId &&
      intent.quotedOutputAmountRaw === result.quote.outputAmountRaw &&
      intent.slippagePercent === result.request.slippagePercent &&
      result.build.available === true &&
      result.build.identityBindingConfirmed === true &&
      result.quote.executionMode?.trim().toUpperCase() === "SWAP" &&
      result.build.executionMode?.trim().toUpperCase() === "SWAP" &&
      result.build.executionMode === result.quote.executionMode &&
      sameAddress(intent.callTarget, result.build.transactionTarget!) &&
      sameAddress(intent.allowanceTokenAddress, intent.fromTokenAddress) &&
      sameAddress(intent.allowanceSpenderAddress, intent.callTarget) &&
      intent.maximumAllowanceDecreaseRaw === intent.amountRaw &&
      intent.minimumReceiveAmountRaw ===
        result.build.minimumReceiveAmountRaw &&
      intent.callValue === "0" &&
      result.simulation.state === "SUCCESS" &&
      result.simulation.direction === "VERIFIED" &&
      result.simulation.failReason === null &&
      result.simulation.effectValidationReason === null &&
      intent.snapshotTimestamp === result.snapshotTimestamp &&
      intent.expiresAt === result.expiresAt
    );
  } catch {
    return false;
  }
}

export function resultMatchesTicker(
  result: ExecutionReadinessResponse | null,
  ticker: string,
): boolean {
  if (!result) return false;
  const current = ticker.trim().toUpperCase();
  return (
    result.request.ticker === current &&
    result.selectedWrapper.ticker === current
  );
}

export function deriveExecutionReadinessPresentation(
  candidate: unknown,
  nowMs: number,
): {
  status: ReadinessDisplayStatus;
  locallyFresh: boolean;
  approvalDigest: string | null;
  assessment: {
    quoteAvailable: boolean;
    unsignedBuildAvailable: boolean;
    simulationSuccessful: boolean;
    executionReadinessBlocked: boolean;
    humanApprovalRequested: false;
  };
} {
  const result = parseExecutionReadinessResponse(candidate);
  if (!result) {
    return {
      status: "STALE / RECHECK REQUIRED",
      locallyFresh: false,
      approvalDigest: null,
      assessment: {
        quoteAvailable: false,
        unsignedBuildAvailable: false,
        simulationSuccessful: false,
        executionReadinessBlocked: true,
        humanApprovalRequested: false,
      },
    };
  }
  const createdMs = Date.parse(result.snapshotTimestamp);
  const expiresMs = Date.parse(result.expiresAt);
  const locallyFresh =
    result.snapshotFresh === true &&
    Number.isFinite(createdMs) &&
    Number.isFinite(expiresMs) &&
    createdMs <= nowMs &&
    createdMs < expiresMs &&
    nowMs < expiresMs;
  const status = locallyFresh
    ? result.executionReadinessStatus
    : "STALE / RECHECK REQUIRED";
  const approvalDigest =
    locallyFresh &&
    result.executionReadinessStatus === "EXECUTION_READY" &&
    result.readiness.status === "EXECUTION_READY" &&
    validApprovalEnvelope(result)
      ? result.approvalEnvelope!.digest
      : null;

  return {
    status,
    locallyFresh,
    approvalDigest,
    assessment: {
      quoteAvailable: result.quote.available,
      unsignedBuildAvailable: result.build.available,
      simulationSuccessful: result.simulation.state === "SUCCESS",
      executionReadinessBlocked: status !== "EXECUTION_READY",
      humanApprovalRequested: false,
    },
  };
}
