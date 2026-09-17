export type HistoricalCorporateActionType =
  | "DIVIDEND"
  | "STOCK_SPLIT";

export type HistoricalCorporateActionState =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

export type HistoricalSourceState =
  | "AVAILABLE"
  | "UNAVAILABLE";

export type HistoricalDataset = "DIVIDENDS" | "SPLITS";

export type HistoricalRejectedRecordReason =
  | "MISSING_OR_INVALID_EVENT_DATE"
  | "FUTURE_EVENT_EXCLUDED";

export interface HistoricalCorporateActionSourceEvidence {
  provider: string;
  endpoint: HistoricalDataset;
  symbol: string;
  retrievedAt: string;
  raw: Record<string, unknown>;
}

export interface HistoricalDividendDetails {
  amountPerShare: string | null;
  declarationDate: string | null;
  exDividendDate: string;
  recordDate: string | null;
  paymentDate: string | null;
}

export interface HistoricalSplitDetails {
  effectiveDate: string;
  factor: string | null;
}

export interface HistoricalCorporateActionEvent {
  eventKey: string;
  ticker: string;
  type: HistoricalCorporateActionType;
  eventDate: string;
  dateSemantics:
    | "EX_DIVIDEND_DATE"
    | "SPLIT_EFFECTIVE_DATE";
  dividend: HistoricalDividendDetails | null;
  split: HistoricalSplitDetails | null;
  source: HistoricalCorporateActionSourceEvidence;
}

export interface HistoricalRejectedRecord {
  provider: string;
  dataset: HistoricalDataset;
  reason: HistoricalRejectedRecordReason;
  anchorField: "ex_dividend_date" | "effective_date";
  retrievedAt: string;
  raw: Record<string, unknown>;
}

export interface HistoricalSourceResult {
  provider: string;
  dataset: HistoricalDataset;
  state: HistoricalSourceState;
  retrievedAt: string;
  recordCount: number;
  rejectedRecordCount: number;
  rejectedRecords: HistoricalRejectedRecord[];
  error: string | null;
}

export type HistoricalCacheState = "MISS" | "HIT";

export interface HistoricalCacheMeta {
  state: HistoricalCacheState;
  fetchedAt: string;
  expiresAt: string | null;
  reusable: boolean;
}

export interface HistoricalCorporateActionResult {
  provider: string;
  state: HistoricalCorporateActionState;
  ticker: string;
  asOfDate: string;
  events: HistoricalCorporateActionEvent[];
  sources: HistoricalSourceResult[];
  cache: HistoricalCacheMeta;
}

export interface HistoricalCorporateActionProvider {
  readonly id: string;
  getHistory(
    ticker: string,
  ): Promise<HistoricalCorporateActionResult>;
}
