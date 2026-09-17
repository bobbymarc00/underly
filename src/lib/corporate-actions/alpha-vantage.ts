import type {
  HistoricalCorporateActionEvent,
  HistoricalCorporateActionResult,
  HistoricalDataset,
  HistoricalRejectedRecord,
  HistoricalSourceResult,
} from "./types";

const BASE_URL = "https://www.alphavantage.co/query";
const DEFAULT_CACHE_TTL_SECONDS = 6 * 60 * 60;
const REQUEST_TIMEOUT_MS = 12_000;

interface CacheEntry {
  fetchedAtMs: number;
  result: Omit<HistoricalCorporateActionResult, "cache">;
}

const cache = new Map<string, CacheEntry>();

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function isoDate(value: unknown): string | null {
  const candidate = scalar(value);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return null;
  }

  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== candidate) return null;

  return candidate;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function cacheTtlMs(): number {
  const raw = process.env.UNDERLY_CORPORATE_ACTIONS_CACHE_TTL_SECONDS;
  if (!raw) return DEFAULT_CACHE_TTL_SECONDS * 1000;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_CACHE_TTL_SECONDS * 1000;
  }

  return Math.floor(parsed * 1000);
}

function providerError(payload: Record<string, unknown>): string | null {
  for (const key of ["Error Message", "Information", "Note"] as const) {
    const value = scalar(payload[key]);
    if (value) return value;
  }
  return null;
}

async function fetchDataset(params: {
  apiKey: string;
  ticker: string;
  dataset: HistoricalDataset;
}): Promise<{
  retrievedAt: string;
  rows: Record<string, unknown>[];
}> {
  const url = new URL(BASE_URL);
  url.searchParams.set("function", params.dataset);
  url.searchParams.set("symbol", params.ticker);
  url.searchParams.set("apikey", params.apiKey);

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Alpha Vantage ${params.dataset} HTTP ${response.status}`,
    );
  }

  const unknownPayload: unknown = await response.json();
  const payload = asRecord(unknownPayload);

  if (!payload) {
    throw new Error(
      `Alpha Vantage ${params.dataset} returned a non-object payload`,
    );
  }

  const upstreamError = providerError(payload);
  if (upstreamError) {
    throw new Error(upstreamError);
  }

  const responseSymbol = scalar(payload.symbol)?.toUpperCase() ?? null;
  if (responseSymbol && responseSymbol !== params.ticker) {
    throw new Error(
      `Alpha Vantage ${params.dataset} symbol mismatch: expected ${params.ticker}, received ${responseSymbol}`,
    );
  }

  if (!Array.isArray(payload.data)) {
    throw new Error(
      `Alpha Vantage ${params.dataset} payload is missing data[]`,
    );
  }

  const rows = payload.data.map((row, index) => {
    const record = asRecord(row);
    if (!record) {
      throw new Error(
        `Alpha Vantage ${params.dataset} data[${index}] is not an object`,
      );
    }
    return record;
  });

  return {
    retrievedAt: new Date().toISOString(),
    rows,
  };
}

function rejectedRecord(params: {
  dataset: HistoricalDataset;
  reason: HistoricalRejectedRecord["reason"];
  anchorField: HistoricalRejectedRecord["anchorField"];
  retrievedAt: string;
  raw: Record<string, unknown>;
}): HistoricalRejectedRecord {
  return {
    provider: "alpha_vantage",
    dataset: params.dataset,
    reason: params.reason,
    anchorField: params.anchorField,
    retrievedAt: params.retrievedAt,
    raw: params.raw,
  };
}

function dividendEvents(params: {
  ticker: string;
  retrievedAt: string;
  rows: Record<string, unknown>[];
}): {
  events: HistoricalCorporateActionEvent[];
  rejectedRecords: HistoricalRejectedRecord[];
} {
  const events: HistoricalCorporateActionEvent[] = [];
  const rejectedRecords: HistoricalRejectedRecord[] = [];
  const asOfDate = params.retrievedAt.slice(0, 10);

  params.rows.forEach((raw) => {
    const exDividendDate = isoDate(raw.ex_dividend_date);
    if (!exDividendDate) {
      rejectedRecords.push(
        rejectedRecord({
          dataset: "DIVIDENDS",
          reason: "MISSING_OR_INVALID_EVENT_DATE",
          anchorField: "ex_dividend_date",
          retrievedAt: params.retrievedAt,
          raw,
        }),
      );
      return;
    }

    // Alpha Vantage documents DIVIDENDS as historical + future declared rows.
    // This endpoint is intentionally history-only, so future declared rows are
    // preserved as rejected evidence instead of being emitted as past events.
    if (exDividendDate > asOfDate) {
      rejectedRecords.push(
        rejectedRecord({
          dataset: "DIVIDENDS",
          reason: "FUTURE_EVENT_EXCLUDED",
          anchorField: "ex_dividend_date",
          retrievedAt: params.retrievedAt,
          raw,
        }),
      );
      return;
    }

    const amountPerShare = scalar(raw.amount);

    events.push({
      eventKey: [
        "alpha_vantage",
        "DIVIDEND",
        params.ticker,
        exDividendDate,
        amountPerShare ?? "UNKNOWN_AMOUNT",
        isoDate(raw.declaration_date) ?? "UNKNOWN_DECLARATION_DATE",
        isoDate(raw.record_date) ?? "UNKNOWN_RECORD_DATE",
        isoDate(raw.payment_date) ?? "UNKNOWN_PAYMENT_DATE",
      ].join(":"),
      ticker: params.ticker,
      type: "DIVIDEND",
      eventDate: exDividendDate,
      dateSemantics: "EX_DIVIDEND_DATE",
      dividend: {
        amountPerShare,
        declarationDate: isoDate(raw.declaration_date),
        exDividendDate,
        recordDate: isoDate(raw.record_date),
        paymentDate: isoDate(raw.payment_date),
      },
      split: null,
      source: {
        provider: "alpha_vantage",
        endpoint: "DIVIDENDS",
        symbol: params.ticker,
        retrievedAt: params.retrievedAt,
        raw,
      },
    });
  });

  return { events, rejectedRecords };
}

function splitEvents(params: {
  ticker: string;
  retrievedAt: string;
  rows: Record<string, unknown>[];
}): {
  events: HistoricalCorporateActionEvent[];
  rejectedRecords: HistoricalRejectedRecord[];
} {
  const events: HistoricalCorporateActionEvent[] = [];
  const rejectedRecords: HistoricalRejectedRecord[] = [];
  const asOfDate = params.retrievedAt.slice(0, 10);

  params.rows.forEach((raw) => {
    const effectiveDate = isoDate(raw.effective_date);
    if (!effectiveDate) {
      rejectedRecords.push(
        rejectedRecord({
          dataset: "SPLITS",
          reason: "MISSING_OR_INVALID_EVENT_DATE",
          anchorField: "effective_date",
          retrievedAt: params.retrievedAt,
          raw,
        }),
      );
      return;
    }

    if (effectiveDate > asOfDate) {
      rejectedRecords.push(
        rejectedRecord({
          dataset: "SPLITS",
          reason: "FUTURE_EVENT_EXCLUDED",
          anchorField: "effective_date",
          retrievedAt: params.retrievedAt,
          raw,
        }),
      );
      return;
    }

    const factor = scalar(raw.split_factor);

    events.push({
      eventKey: [
        "alpha_vantage",
        "STOCK_SPLIT",
        params.ticker,
        effectiveDate,
        factor ?? "UNKNOWN_FACTOR",
      ].join(":"),
      ticker: params.ticker,
      type: "STOCK_SPLIT",
      eventDate: effectiveDate,
      dateSemantics: "SPLIT_EFFECTIVE_DATE",
      dividend: null,
      split: {
        effectiveDate,
        factor,
      },
      source: {
        provider: "alpha_vantage",
        endpoint: "SPLITS",
        symbol: params.ticker,
        retrievedAt: params.retrievedAt,
        raw,
      },
    });
  });

  return { events, rejectedRecords };
}

function sourceUnavailable(
  dataset: HistoricalDataset,
  error: unknown,
): HistoricalSourceResult {
  return {
    provider: "alpha_vantage",
    dataset,
    state: "UNAVAILABLE",
    retrievedAt: new Date().toISOString(),
    recordCount: 0,
    rejectedRecordCount: 0,
    rejectedRecords: [],
    error:
      error instanceof Error
        ? error.message
        : `Alpha Vantage ${dataset} request failed`,
  };
}

function withCacheMeta(
  entry: CacheEntry,
  state: "MISS" | "HIT",
  reusable: boolean,
): HistoricalCorporateActionResult {
  const ttlMs = cacheTtlMs();
  return {
    ...entry.result,
    cache: {
      state,
      fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
      expiresAt:
        reusable && ttlMs > 0
          ? new Date(entry.fetchedAtMs + ttlMs).toISOString()
          : null,
      reusable,
    },
  };
}

function dedupeEvents(
  events: HistoricalCorporateActionEvent[],
): HistoricalCorporateActionEvent[] {
  const byKey = new Map<string, HistoricalCorporateActionEvent>();
  for (const event of events) {
    if (!byKey.has(event.eventKey)) byKey.set(event.eventKey, event);
  }
  return Array.from(byKey.values());
}

export class AlphaVantageCorporateActionHistoryProvider {
  readonly id = "alpha_vantage";

  constructor(private readonly apiKey: string) {}

  async getHistory(
    tickerInput: string,
  ): Promise<HistoricalCorporateActionResult> {
    const ticker = tickerInput.trim().toUpperCase();
    const ttlMs = cacheTtlMs();
    const now = Date.now();
    const existing = cache.get(ticker);

    if (
      existing &&
      ttlMs > 0 &&
      now - existing.fetchedAtMs < ttlMs
    ) {
      return withCacheMeta(existing, "HIT", true);
    }

    const [dividendResult, splitResult] = await Promise.allSettled([
      fetchDataset({
        apiKey: this.apiKey,
        ticker,
        dataset: "DIVIDENDS",
      }),
      fetchDataset({
        apiKey: this.apiKey,
        ticker,
        dataset: "SPLITS",
      }),
    ]);

    const events: HistoricalCorporateActionEvent[] = [];
    const sources: HistoricalSourceResult[] = [];

    if (dividendResult.status === "fulfilled") {
      const normalized = dividendEvents({
        ticker,
        retrievedAt: dividendResult.value.retrievedAt,
        rows: dividendResult.value.rows,
      });
      events.push(...normalized.events);
      sources.push({
        provider: this.id,
        dataset: "DIVIDENDS",
        state: "AVAILABLE",
        retrievedAt: dividendResult.value.retrievedAt,
        recordCount: dividendResult.value.rows.length,
        rejectedRecordCount: normalized.rejectedRecords.length,
        rejectedRecords: normalized.rejectedRecords,
        error: null,
      });
    } else {
      sources.push(
        sourceUnavailable("DIVIDENDS", dividendResult.reason),
      );
    }

    if (splitResult.status === "fulfilled") {
      const normalized = splitEvents({
        ticker,
        retrievedAt: splitResult.value.retrievedAt,
        rows: splitResult.value.rows,
      });
      events.push(...normalized.events);
      sources.push({
        provider: this.id,
        dataset: "SPLITS",
        state: "AVAILABLE",
        retrievedAt: splitResult.value.retrievedAt,
        recordCount: splitResult.value.rows.length,
        rejectedRecordCount: normalized.rejectedRecords.length,
        rejectedRecords: normalized.rejectedRecords,
        error: null,
      });
    } else {
      sources.push(sourceUnavailable("SPLITS", splitResult.reason));
    }

    const availableCount = sources.filter(
      (source) => source.state === "AVAILABLE",
    ).length;

    const normalizedEvents = dedupeEvents(events).sort(
      (a, b) =>
        b.eventDate.localeCompare(a.eventDate) ||
        a.type.localeCompare(b.type) ||
        a.eventKey.localeCompare(b.eventKey),
    );

    const fetchedAtMs = Date.now();
    const resultWithoutCache = {
      provider: this.id,
      state:
        availableCount === 0
          ? ("UNAVAILABLE" as const)
          : availableCount === sources.length
            ? ("AVAILABLE" as const)
            : ("PARTIAL" as const),
      ticker,
      asOfDate: new Date(fetchedAtMs).toISOString().slice(0, 10),
      events: normalizedEvents,
      sources,
    };

    const entry: CacheEntry = {
      fetchedAtMs,
      result: resultWithoutCache,
    };

    const reusable =
      resultWithoutCache.state === "AVAILABLE" && ttlMs > 0;

    if (reusable) {
      cache.set(ticker, entry);
    }

    return withCacheMeta(entry, "MISS", reusable);
  }
}

export function __resetAlphaVantageCorporateActionCacheForTests() {
  cache.clear();
}
