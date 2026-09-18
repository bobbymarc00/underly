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
