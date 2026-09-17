import Decimal from "decimal.js";
import { NextRequest, NextResponse } from "next/server";

import {
  CANDLE_BARS,
  getCandles,
  type BinanceCandleRow,
  type CandleBar,
} from "@/lib/binance/market";
import {
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";

export const runtime = "nodejs";

const MAX_LIMIT = 500;

type SeriesStatus = "AVAILABLE" | "EMPTY" | "UNAVAILABLE";
type OverallStatus = "AVAILABLE" | "PARTIAL" | "EMPTY" | "UNAVAILABLE";
type ChartMode = "raw" | "indexed100";

interface NormalizedCandle {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  timestamp: number;
  tradeCount: number;
}

interface HistoricalSeries {
  provider: string;
  symbol: string;
  contractAddress: string;
  tokenShareRatio: string | null;
  status: SeriesStatus;
  upstreamCode: number | null;
  upstreamMessage: string | null;
  coverage: {
    candleCount: number;
    firstTimestamp: number | null;
    lastTimestamp: number | null;
  };
  candles: NormalizedCandle[];
}

function parsePositiveInt(
  value: string | null,
  fallback: number | null,
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function asFiniteString(value: string | number): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return String(value);
}

function normalizeCandle(row: BinanceCandleRow): NormalizedCandle | null {
  if (!Array.isArray(row) || row.length < 7) return null;

  const open = asFiniteString(row[0]);
  const high = asFiniteString(row[1]);
  const low = asFiniteString(row[2]);
  const close = asFiniteString(row[3]);
  const volume = asFiniteString(row[4]);
  const timestamp = Number(row[5]);
  const tradeCount = Number(row[6]);

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(tradeCount)
  ) {
    return null;
  }

  return {
    open,
    high,
    low,
    close,
    volume,
    timestamp,
    tradeCount,
  };
}

function dedupeAssets(assets: RwaTokenListRow[]): RwaTokenListRow[] {
  const seen = new Set<string>();
  const result: RwaTokenListRow[] = [];

  for (const asset of assets) {
    const key = asset.tokenContractAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
}

function overallStatus(statuses: SeriesStatus[]): OverallStatus {
  const available = statuses.filter((status) => status === "AVAILABLE").length;
  const empty = statuses.filter((status) => status === "EMPTY").length;
  const unavailable = statuses.filter(
    (status) => status === "UNAVAILABLE",
  ).length;

  if (unavailable === statuses.length) return "UNAVAILABLE";
  if (available === 0 && empty > 0 && unavailable === 0) return "EMPTY";
  if (unavailable > 0) return "PARTIAL";
  return "AVAILABLE";
}

function coverage(candles: NormalizedCandle[]) {
  return {
    candleCount: candles.length,
    firstTimestamp: candles[0]?.timestamp ?? null,
    lastTimestamp: candles[candles.length - 1]?.timestamp ?? null,
  };
}

function uniqueTimeline(series: HistoricalSeries[]): number[] {
  const timestamps = new Set<number>();

  for (const item of series) {
    if (item.status !== "AVAILABLE") continue;
    for (const candle of item.candles) timestamps.add(candle.timestamp);
  }

  return Array.from(timestamps).sort((a, b) => a - b);
}

function commonTimestamps(series: HistoricalSeries[]): number[] {
  const available = series.filter((item) => item.status === "AVAILABLE");
  if (!available.length) return [];

  let common = new Set(
    available[0].candles.map((candle) => candle.timestamp),
  );

  for (const item of available.slice(1)) {
    const own = new Set(item.candles.map((candle) => candle.timestamp));
    common = new Set(Array.from(common).filter((ts) => own.has(ts)));
  }

  return Array.from(common).sort((a, b) => a - b);
}

function rawChart(series: HistoricalSeries[]) {
  const timeline = uniqueTimeline(series);

  return {
    mode: "RAW_TOKEN_PRICE" as const,
    status: "AVAILABLE" as const,
    baselineTimestamp: null,
    commonTimestampCount: commonTimestamps(series).length,
    timeline,
    series: series
      .filter((item) => item.status === "AVAILABLE")
      .map((item) => {
        const closeByTimestamp = new Map(
          item.candles.map((candle) => [candle.timestamp, candle.close]),
        );

        return {
          provider: item.provider,
          symbol: item.symbol,
          contractAddress: item.contractAddress,
          values: timeline.map(
            (timestamp) => closeByTimestamp.get(timestamp) ?? null,
          ),
        };
      }),
  };
}

function indexedChart(series: HistoricalSeries[]) {
  const available = series.filter((item) => item.status === "AVAILABLE");
  const timeline = uniqueTimeline(series);
  const common = commonTimestamps(series);
  const baselineTimestamp = common[0] ?? null;

  if (!available.length || baselineTimestamp === null) {
    return {
      mode: "INDEXED_100" as const,
      status: "UNAVAILABLE" as const,
      reason: "NO_COMMON_BASELINE_TIMESTAMP",
      baselineTimestamp: null,
      commonTimestampCount: common.length,
      timeline,
      series: [],
    };
  }

  const chartSeries = available.map((item) => {
    const closeByTimestamp = new Map(
      item.candles.map((candle) => [candle.timestamp, candle.close]),
    );
    const baselineClose = closeByTimestamp.get(baselineTimestamp);

    if (!baselineClose) {
      throw new Error("Indexed chart baseline invariant failed");
    }

    const baseline = new Decimal(baselineClose);

    return {
      provider: item.provider,
      symbol: item.symbol,
      contractAddress: item.contractAddress,
      baselineClose,
      values: timeline.map((timestamp) => {
        const close = closeByTimestamp.get(timestamp);
        if (!close) return null;

        return new Decimal(close)
          .div(baseline)
          .mul(100)
          .toSignificantDigits(24)
          .toFixed();
      }),
    };
  });

  return {
    mode: "INDEXED_100" as const,
    status: "AVAILABLE" as const,
    reason: null,
    baselineTimestamp,
    commonTimestampCount: common.length,
    timeline,
    series: chartSeries,
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker is required" },
      { status: 400 },
    );
  }

  if (ticker.length > 20) {
    return NextResponse.json(
      { error: "ticker is too long" },
      { status: 400 },
    );
  }

  const requestedBar = url.searchParams.get("bar") ?? "1h";
  if (!CANDLE_BARS.includes(requestedBar as CandleBar)) {
    return NextResponse.json(
      {
        error: "unsupported bar",
        supportedBars: CANDLE_BARS,
      },
      { status: 400 },
    );
  }
  const bar = requestedBar as CandleBar;

  const mode = url.searchParams.get("mode") ?? "raw";
  if (mode !== "raw" && mode !== "indexed100") {
    return NextResponse.json(
      {
        error: "unsupported mode",
        supportedModes: ["raw", "indexed100"],
      },
      { status: 400 },
    );
  }

  const limit = parsePositiveInt(url.searchParams.get("limit"), 100);
  if (limit === null || limit > MAX_LIMIT) {
    return NextResponse.json(
      { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
      { status: 400 },
    );
  }

  const startRaw = url.searchParams.get("start");
  const endRaw = url.searchParams.get("end");
  const start = startRaw === null ? null : parsePositiveInt(startRaw, null);
  const end = endRaw === null ? null : parsePositiveInt(endRaw, null);

  if (startRaw !== null && start === null) {
    return NextResponse.json(
      { error: "start must be a positive Unix millisecond timestamp" },
      { status: 400 },
    );
  }

  if (endRaw !== null && end === null) {
    return NextResponse.json(
      { error: "end must be a positive Unix millisecond timestamp" },
      { status: 400 },
    );
  }

  if (start !== null && end !== null && start >= end) {
    return NextResponse.json(
      { error: "start must be earlier than end" },
      { status: 400 },
    );
  }

  const chainId = process.env.UNDERLY_CHAIN_ID || "56";

  try {
    const universe = await listBscRwaTokens(chainId);

    if (universe.code !== 0) {
      return NextResponse.json(
        {
          error: universe.msg,
          upstreamCode: universe.code,
        },
        { status: 502 },
      );
    }

    const matching = dedupeAssets(
      (universe.data ?? []).filter(
        (asset) =>
          String(asset.binanceChainId) === chainId &&
          (asset.underlyingTicker ?? "").trim().toUpperCase() === ticker,
      ),
    );

    if (!matching.length) {
      return NextResponse.json(
        { error: `No RWA wrappers found for ${ticker}` },
        { status: 404 },
      );
    }

    const series: HistoricalSeries[] = await Promise.all(
      matching.map(async (asset) => {
        try {
          const envelope = await getCandles({
            chainId,
            contractAddress: asset.tokenContractAddress,
            bar,
            limit,
            start: start ?? undefined,
            end: end ?? undefined,
          });

          if (envelope.code !== 0) {
            return {
              provider: asset.platformId?.trim() || "unknown",
              symbol: asset.tokenSymbol,
              contractAddress: asset.tokenContractAddress,
              tokenShareRatio: asset.tokenToShareRatio ?? null,
              status: "UNAVAILABLE" as const,
              upstreamCode: envelope.code,
              upstreamMessage: envelope.msg,
              coverage: coverage([]),
              candles: [],
            };
          }

          const candles = (envelope.data ?? [])
            .map(normalizeCandle)
            .filter(
              (item): item is NormalizedCandle => item !== null,
            )
            .sort((a, b) => a.timestamp - b.timestamp);

          return {
            provider: asset.platformId?.trim() || "unknown",
            symbol: asset.tokenSymbol,
            contractAddress: asset.tokenContractAddress,
            tokenShareRatio: asset.tokenToShareRatio ?? null,
            status: candles.length
              ? ("AVAILABLE" as const)
              : ("EMPTY" as const),
            upstreamCode: envelope.code,
            upstreamMessage: envelope.msg,
            coverage: coverage(candles),
            candles,
          };
        } catch (error) {
          return {
            provider: asset.platformId?.trim() || "unknown",
            symbol: asset.tokenSymbol,
            contractAddress: asset.tokenContractAddress,
            tokenShareRatio: asset.tokenToShareRatio ?? null,
            status: "UNAVAILABLE" as const,
            upstreamCode: null,
            upstreamMessage:
              error instanceof Error
                ? error.message
                : "Candle request failed",
            coverage: coverage([]),
            candles: [],
          };
        }
      }),
    );

    series.sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.symbol.localeCompare(b.symbol),
    );

    const status = overallStatus(series.map((item) => item.status));
    const chart =
      (mode as ChartMode) === "indexed100"
        ? indexedChart(series)
        : rawChart(series);

    const responseBody = {
      version: "0.2",
      generatedAt: new Date().toISOString(),
      ticker,
      chainId,
      bar,
      requestedLimit: limit,
      range: {
        start,
        end,
      },
      normalization: {
        mode:
          mode === "indexed100"
            ? "INDEXED_100"
            : "RAW_TOKEN_PRICE",
        financialValues: "DECIMAL_STRING",
        timestamp: "UNIX_MS",
        missingSamples: "NULL_IN_ALIGNED_CHART_NOT_ZERO_FILLED",
        shareAdjusted: false,
        note:
          mode === "indexed100"
            ? "Indexed values use the earliest timestamp shared by every AVAILABLE wrapper as the 100 baseline."
            : "Raw chart values are wrapper close prices. No share-ratio adjustment is applied.",
      },
      status,
      summary: {
        wrapperCount: series.length,
        availableSeries: series.filter(
          (item) => item.status === "AVAILABLE",
        ).length,
        emptySeries: series.filter(
          (item) => item.status === "EMPTY",
        ).length,
        unavailableSeries: series.filter(
          (item) => item.status === "UNAVAILABLE",
        ).length,
      },
      series,
      chart,
    };

    if (status === "UNAVAILABLE") {
      return NextResponse.json(
        {
          ...responseBody,
          error: "Historical candle data unavailable for all wrappers",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Historical market data request failed",
      },
      { status: 502 },
    );
  }
}
