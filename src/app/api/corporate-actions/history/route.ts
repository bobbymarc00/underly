import { NextRequest, NextResponse } from "next/server";

import { getConfiguredCorporateActionHistoryProvider } from "@/lib/corporate-actions/provider";

export const runtime = "nodejs";

function parseLimit(value: string | null): number | null {
  if (value === null) return 100;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  if (parsed < 1 || parsed > 500) return null;

  return parsed;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker =
    url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const limit = parseLimit(url.searchParams.get("limit"));

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

  if (limit === null) {
    return NextResponse.json(
      { error: "limit must be an integer between 1 and 500" },
      { status: 400 },
    );
  }

  const configured = getConfiguredCorporateActionHistoryProvider();
  const generatedAt = new Date().toISOString();

  if (configured.status === "NOT_CONFIGURED") {
    return NextResponse.json({
      version: "0.2.6",
      generatedAt,
      ticker,
      status: "NOT_CONFIGURED",
      provider: null,
      events: [],
      sources: [],
      cache: null,
      note: configured.reason,
      separation: {
        currentActionGuardEndpoint: "/api/corporate-actions",
        historicalTimelineEndpoint:
          `/api/corporate-actions/history?ticker=${encodeURIComponent(ticker)}`,
        semantics:
          "Historical provider events do not mutate or drive the current Binance ActionGuard.",
      },
    });
  }

  try {
    const result = await configured.provider.getHistory(ticker);
    const events = result.events.slice(0, limit);

    const payload = {
      version: "0.2.6",
      generatedAt,
      ticker,
      asOfDate: result.asOfDate,
      status: result.state,
      provider: result.provider,
      totalAvailableEvents: result.events.length,
      returnedEvents: events.length,
      truncated: events.length < result.events.length,
      events,
      sources: result.sources,
      cache: result.cache,
      methodology: {
        timeline:
          "Historical dividend events use the provider ex-dividend date as eventDate and exclude future declared distributions. Stock splits use the provider effective date. Events are sorted newest first.",
        evidence:
          "Source rows are retained verbatim in event.source.raw. Rejected rows retain raw evidence in sources[].rejectedRecords[].raw. Missing/malformed dates are never inferred, and future declared rows are excluded from the history timeline.",
        values:
          "Dividend amounts and split factors preserve provider scalar values. Underly does not invent a currency, split ratio, or missing date.",
      },
      separation: {
        currentActionGuardEndpoint: "/api/corporate-actions",
        historicalTimelineEndpoint:
          `/api/corporate-actions/history?ticker=${encodeURIComponent(ticker)}`,
        semantics:
          "Historical provider events are informational evidence only and remain separate from the current Binance ActionGuard.",
      },
    };

    return NextResponse.json(payload, {
      status: result.state === "UNAVAILABLE" ? 502 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        version: "0.2.6",
        generatedAt,
        ticker,
        status: "UNAVAILABLE",
        provider: configured.provider.id,
        events: [],
        sources: [],
        cache: null,
        error:
          error instanceof Error
            ? error.message
            : "Historical corporate-action provider request failed",
        separation: {
          currentActionGuardEndpoint: "/api/corporate-actions",
          historicalTimelineEndpoint:
            `/api/corporate-actions/history?ticker=${encodeURIComponent(ticker)}`,
          semantics:
            "Historical source failure does not alter the current Binance ActionGuard.",
        },
      },
      { status: 502 },
    );
  }
}

