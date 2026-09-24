export interface UniverseWrapper {
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | string | null;
  tokenShareRatio: string | null;
}

export interface UniverseUnderlying {
  ticker: string;
  name: string;
  wrapperCount: number;
  providers: string[];
  wrappers: UniverseWrapper[];
}

export interface UniversePayload {
  version: string;
  chainId: string;
  generatedAt: string;
  summary: {
    underlyingCount: number;
    wrapperCount: number;
    providerCount: number;
  };
  providers: Array<{
    id: string;
    wrapperCount: number;
    underlyingCount: number;
  }>;
  underlyings: UniverseUnderlying[];
}

export type ResolutionStatus =
  | "CONSENSUS"
  | "SINGLE_SOURCE"
  | "CONFLICT"
  | "UNKNOWN";

export interface ResolvedField {
  value: string | null;
  status: ResolutionStatus;
  evidence: Array<{
    provider: string;
    symbol: string;
    value: string;
  }>;
}

export interface CompanyWrapper {
  provider: string;
  symbol: string;
  contractAddress: string;
  tokenShareRatio: string | null;
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  sourceState: {
    profile: "AVAILABLE" | "UNAVAILABLE";
    market: "AVAILABLE" | "UNAVAILABLE";
  };
  company: {
    name: string;
    ceo: string | null;
    website: string | null;
    industry: string | null;
    description: string | null;
    concepts: string[];
  };
  fundamentals: Record<string, string | null>;
  fundamentalsSource?: {
    referencePrice: "UNDERLYING_MARKET" | "RWA_PRICE" | null;
  };
  marketSession: {
    tradingAvailable: boolean | null;
    status: string | null;
    reasonCode: string | null;
    reasonMessage: string | null;
    nextOpenAt: number | null;
    nextCloseAt: number | null;
  };
}

export interface CompanyPayload {
  version: string;
  generatedAt: string;
  ticker: string;
  chainId: string;
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  company: {
    name: string;
    fields: Record<string, ResolvedField>;
  };
  fundamentals: {
    fields: Record<string, ResolvedField>;
  };
  wrappers: CompanyWrapper[];
}

export type HistoryMode = "raw" | "indexed100";

export interface HistoryChartSeries {
  provider: string;
  symbol: string;
  contractAddress: string;
  baselineClose?: string;
  values: Array<string | null>;
}

export interface MarketHistoryPayload {
  version: string;
  generatedAt: string;
  ticker: string;
  chainId: string;
  bar: string;
  requestedLimit: number;
  status: "AVAILABLE" | "PARTIAL" | "EMPTY" | "UNAVAILABLE";
  summary: {
    wrapperCount: number;
    availableSeries: number;
    emptySeries: number;
    unavailableSeries: number;
  };
  chart: {
    mode: "RAW_TOKEN_PRICE" | "INDEXED_100";
    status: "AVAILABLE" | "UNAVAILABLE";
    reason?: string | null;
    baselineTimestamp: number | null;
    commonTimestampCount: number;
    timeline: number[];
    series: HistoryChartSeries[];
  };
}

export interface WalletHolding {
  ticker: string;
  name: string;
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | null;
  tokenShareRatio: string | null;
  balanceBaseUnits: string;
  quantity: string | null;
  evidence: {
    blockTag: string;
    rawBalanceHex: string;
  };
}

export interface WalletInspectorPayload {
  version: string;
  generatedAt: string;
  address: string;
  chainId?: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_CONFIGURED";
  scope?: "TOKENIZED_EQUITY_WRAPPERS_ONLY";
  snapshot?: {
    rpcChainId?: string;
    blockTag: string;
    blockNumber: string;
  };
  summary?: {
    knownWrapperCount: number;
    successfulChecks: number;
    failedChecks: number;
    holdingCount: number;
  };
  holdings: WalletHolding[];
  error?: string;
  note?: string;
  readOnly: {
    enabled: boolean;
    rpcMethods: string[];
    transactionMethods: string[];
    privateKeyRequired?: boolean;
    signatureRequired?: boolean;
    approvalRequired?: boolean;
  };
}

export type PortfolioEvidenceStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR"
  | "INVALID";

export interface PortfolioEvidenceRef {
  source: string;
  status: PortfolioEvidenceStatus;
  reason: string | null;
}

export interface PortfolioPosition {
  underlying: {
    identity: string | null;
    ticker: string | null;
    name: string | null;
    evidence: PortfolioEvidenceRef;
  };
  wrapper: {
    provider: string;
    symbol: string;
    chainId: string;
    contractAddress: string;
  };
  balance: {
    status: "POSITIVE";
    rawBaseUnits: string;
    rawHex: string | null;
    decimals: number | null;
    quantity: string | null;
    quantityStatus: PortfolioEvidenceStatus;
    blockTag: string;
    source: "EVM_JSON_RPC";
  };
  equivalence: {
    tokenShareRatio: string | null;
    underlyingEquivalentShares: string | null;
    status: PortfolioEvidenceStatus;
    evidence: PortfolioEvidenceRef;
  };
  valuation: {
    tokenPriceUsd: string | null;
    referencePriceUsd: string | null;
    indicativeValueUsd: string | null;
    referenceValueUsd: string | null;
    status: PortfolioEvidenceStatus;
    tokenPriceEvidence: PortfolioEvidenceRef;
    referencePriceEvidence: PortfolioEvidenceRef;
  };
  marketSession: {
    tradingAvailable: boolean | null;
    status: string | null;
    reasonCode: string | null;
    reasonMessage: string | null;
  } | null;
  actionGuard: {
    status: "CLEAR" | "ACTIVE" | "UNKNOWN";
    reason: string | null;
  } | null;
  integrity: {
    status: "PASS" | "WARN" | "BLOCKED" | "UNKNOWN" | "NOT_APPLICABLE";
    dataCompleteness: "COMPLETE" | "PARTIAL";
    missingFields: string[];
  };
  evidence: {
    identity: PortfolioEvidenceRef;
    decimals: PortfolioEvidenceRef;
    ratio: PortfolioEvidenceRef;
    tokenPrice: PortfolioEvidenceRef;
    referencePrice: PortfolioEvidenceRef;
    marketSession: PortfolioEvidenceRef;
    actionGuard: PortfolioEvidenceRef;
    integrity: PortfolioEvidenceRef;
    sources: Record<string, PortfolioEvidenceRef>;
  };
}

export interface PortfolioUnderlyingExposure {
  identity: string;
  ticker: string;
  name: string | null;
  positionCount: number;
  wrapperContracts: string[];
  underlyingEquivalentShares: string | null;
  knownUnderlyingEquivalentShares: string;
  indicativeValueUsd: string | null;
  knownIndicativeValueUsd: string;
  status: "AVAILABLE" | "PARTIAL";
}

export interface PortfolioPayload {
  version: string;
  generatedAt: string;
  address: string;
  chainId: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_CONFIGURED";
  scope?: "BSC_TOKENIZED_EQUITY_WRAPPERS_ONLY";
  error?: string;
  snapshot?: {
    rpcChainId: string;
    blockTag: string;
    blockNumber: string;
    blockTimestamp: string | number | null;
    blockTimestampStatus: "AVAILABLE" | "UNAVAILABLE";
    blockTimestampReason?: string;
  };
  universe?: {
    source: string;
    status?: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
    reason?: string | null;
    receivedCount: number;
    chainCandidateCount?: number;
    validatedWrapperCount: number;
    rejectedCount: number;
    rejected: Array<{
      contractAddress: string | null;
      reason: string;
    }>;
  };
  summary?: {
    checkedWrapperCount: number;
    positiveBalanceCount: number;
    provenZeroBalanceCount: number;
    failedBalanceCount: number;
    metadataFailureCount: number;
    positionCount: number;
    underlyingCount: number;
    indicativeValueUsd: string | null;
    knownIndicativeValueUsd: string;
    valuationStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  };
  positions: PortfolioPosition[];
  underlyingExposures: PortfolioUnderlyingExposure[];
  exposures?: PortfolioExposureIntelligence;
  balanceChecks: Array<{
    chainId: string;
    contractAddress: string;
    blockTag: string;
    status:
      | "POSITIVE"
      | "ZERO"
      | "RPC_ERROR"
      | "BALANCE_INVALID"
      | "METADATA_UNAVAILABLE";
    balanceBaseUnits: string | null;
    error: string | null;
  }>;
  performance?: {
    unit: "milliseconds";
    totalBeforeSerializationMs: number;
    stages: {
      chainVerificationMs: number;
      blockSnapshotMs: number;
      universeDiscoveryMs: number;
      balanceRpcMs: number;
      metadataEnrichmentMs: number;
      portfolioCalculationMs: number;
    };
    calls: {
      rpc: {
        chainVerification: number;
        blockSnapshot: number;
        multicallContractCode: number;
        balanceBatches: number;
        balanceOfInnerCalls: number;
      };
      provider: Record<
        "price" | "profile" | "market",
        {
          calls: number;
          cacheHits: number;
          itemCount: number;
          averageMs: number;
          maximumMs: number;
          errorCount: number;
        }
      > & { universe: number };
    };
    controls: {
      balanceStrategy: "VERIFIED_BSC_MULTICALL3";
      multicallBatchSize: number;
      multicallConcurrency: number;
      multicallTimeoutMs: number;
      multicallContractCodeVerified: boolean;
      metadataEntryConcurrency: number;
      priceBatchSize: number;
      profileCacheTtlMs: number;
      balanceCache: "DISABLED";
      priceCache: "DISABLED";
      marketCache: "DISABLED";
      upstreamTimeoutMs: number;
    };
  };
  readOnly: {
    enabled: boolean;
    rpcMethods: string[];
    transactionMethods: string[];
    privateKeyRequired: boolean;
    signatureRequired: boolean;
    approvalRequired: boolean;
    quoteRequested: boolean;
    transactionBuilt: boolean;
    simulationRequested: boolean;
  };
}
import type { PortfolioExposureIntelligence } from "@/lib/underly/portfolio-intelligence";
