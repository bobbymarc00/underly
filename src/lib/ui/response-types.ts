export type Intent = "BUY" | "HOLD" | "SELL" | "COLLATERAL";
export type FindingSeverity = "critical" | "warning" | "info" | "unknown";
export type ActionGuardStatus = "CLEAR" | "ACTIVE" | "UNKNOWN";
export type AttestationStatus = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";

export interface SearchWrapper {
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
}

export interface SearchItem {
  ticker: string;
  companyName: string;
  wrappers: SearchWrapper[];
}

export interface SearchResponse {
  data: SearchItem[];
}

export interface Finding {
  code: string;
  severity: FindingSeverity;
  title: string;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ExecutionRoute {
  attempted: boolean;
  available: boolean | null;
  vendor: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}

export interface ExecutionLeg {
  benchmark: string;
  benchmarkValueUsd: string;
  quotedValueUsd: string;
  frictionUsd: string;
  frictionPct: string;
  favorableQuotedDeltaUsd: string | null;
}

export interface ExecutionResult {
  benchmarkNotionalUsd: string | null;
  methodology:
    | "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE"
    | "CURRENT_DIRECT_EXIT_QUOTE"
    | "CURRENT_LIQUIDATION_VALUE"
    | "NOT_APPLICABLE";
  quantitySource:
    | "SYNTHETIC_ENTRY_OUTPUT"
    | "DERIVED_FROM_TOKEN_PRICE"
    | "USER_SUPPLIED"
    | null;
  tokenAmount: string | null;
  entry: ExecutionRoute;
  exit: ExecutionRoute;
  breakdown: {
    entry: ExecutionLeg | null;
    exit: ExecutionLeg | null;
    roundTrip: ExecutionLeg | null;
  };
  executableValueUsd: string | null;
  currentHaircutUsd: string | null;
  currentHaircutPct: string | null;
  favorableQuotedDeltaUsd: string | null;
  quoteTimestamp: string;
}

export interface WrapperResult {
  identity: {
    symbol: string;
    platform: string;
    chainId: string;
    contractAddress: string;
    tokenDecimals: number | string | null;
    tokenShareRatio: string | null;
  };
  passport: {
    provider: string;
    attestation: {
      daily: AttestationStatus;
      monthly: AttestationStatus;
      dailyUrl: string | null;
      monthlyUrl: string | null;
    };
    dataCompleteness: "COMPLETE" | "PARTIAL";
    missingFields: Array<string | null>;
  };
  market: {
    tokenPriceUsd: string | null;
    referencePriceUsd: string | null;
    referenceGapPct: string | null;
    tokenPriceUpdatedAt: string | number | null;
    referencePriceUpdatedAt: string | number | null;
    session: {
      tradingAvailable: boolean | null;
      status: string | null;
      reasonCode: string | null;
      reasonMessage: string | null;
      nextOpenAt: number | null;
      nextCloseAt: number | null;
    };
  };
  integrity: {
    tokenShareRatioKnown: boolean;
    referenceAvailable: boolean;
    attestationAvailable: boolean | null;
    status: "PASS" | "WARN" | "UNKNOWN";
  };
  execution: ExecutionResult;
  valuation: {
    displayedValueUsd: string;
    referenceAdjustedValueUsd: string | null;
    executableValueUsd: string | null;
    conservativeValueUsd: string;
    basis: string[];
  } | null;
  corporateActions: {
    activeIssue: boolean | null;
    status: ActionGuardStatus;
    events: Array<{
      type: string;
      status: "ACTIVE";
      reasonCode: string | null;
      reasonMessage: string | null;
    }>;
    reason: string | null;
    source: "RWA_STATUS_INFO";
  };
  findings: Finding[];
  sources: Array<{
    provider: string;
    endpoint: string;
    observedAt: string;
    upstreamCode?: number;
    upstreamMessage?: string;
  }>;
}

export interface FirewallResponse {
  version: "0.1" | string;
  requestId: string;
  checkedAt: string;
  request: {
    ticker: string | null;
    contractAddress: string | null;
    intent: Intent;
    amountUsd: string | null;
    tokenAmount: string | null;
    amountMeaning: string;
    positionInput: string;
    platform: string | null;
    chainId: string;
  };
  methodology: {
    execution: string;
    conservativeValuation: string;
    corporateActions: string;
  };
  underlying: {
    ticker: string;
    name: string;
    assetType: string;
  };
  wrappers: WrapperResult[];
  proof: {
    proofId: string;
    schemaVersion: string;
    generatedAt: string;
    dataHash: string;
  };
}

export interface FirewallRequestPayload {
  ticker?: string;
  contractAddress?: string;
  intent: Intent;
  amountUsd?: string;
  tokenAmount?: string;
}
