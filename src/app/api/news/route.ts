import { NextRequest, NextResponse } from "next/server";

import { getConfiguredNewsProvider } from "@/lib/news/provider";
import {
  classifyNewsProviderFailure,
} from "@/lib/news/public-error";
import type { NewsScope } from "@/lib/news/types";

export const runtime = "nodejs";

function parseLimit(value: string | null): number | null {
  if (value === null) return 10;
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  if (parsed < 1 || parsed > 50) return null;

  return parsed;
}

function parseScope(
  value: string | null,
  ticker: string,
): NewsScope | null {
  if (value === null || value.trim() === "") {
    return ticker ? "ticker" : "market";
  }

  if (value === "market" || value === "ticker") {
    return value;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker =
    url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const limit = parseLimit(url.searchParams.get("limit"));
  const scope = parseScope(
    url.searchParams.get("scope")?.trim().toLowerCase() ?? null,
    ticker,
  );

  if (limit === null) {
    return NextResponse.json(
      { error: "limit must be an integer between 1 and 50" },
      { status: 400 },
    );
  }

  if (scope === null) {
    return NextResponse.json(
      { error: "scope must be market or ticker" },
      { status: 400 },
    );
  }

  if (scope === "ticker" && !ticker) {
    return NextResponse.json(
      { error: "ticker is required for ticker scope" },
      { status: 400 },
    );
  }

  if (ticker.length > 20) {
    return NextResponse.json(
      { error: "ticker is too long" },
      { status: 400 },
    );
  }

  const configured = getConfiguredNewsProvider();

  if (configured.status === "NOT_CONFIGURED") {
    return NextResponse.json({
      version: "0.2",
      generatedAt: new Date().toISOString(),
      scope,
      ticker: scope === "ticker" ? ticker : null,
      status: "NOT_CONFIGURED",
      provider: null,
      items: [],
      cache: null,
      note: "News is not configured for this deployment.",
    });
  }

  try {
    const result =
      scope === "market"
        ? await configured.provider.getMarketNews({
            limit,
          })
        : await configured.provider.getCompanyNews({
            ticker,
            limit,
          });

    return NextResponse.json({
      version: "0.2",
      generatedAt: new Date().toISOString(),
      scope,
      ticker: scope === "ticker" ? ticker : null,
      status: "AVAILABLE",
      provider: result.provider,
      cache: result.cache,
      items: result.items,
      methodology:
        scope === "market"
          ? {
              query:
                "Landing and ticker detail share one cached financial-markets provider snapshot. Landing returns the newest items.",
              ordering: "LATEST_FIRST",
              relation:
                "No single ticker is required for landing-page market news.",
              content:
                "Underly preserves source headline, publication timestamp, outbound URL, topics and ticker evidence. It does not generate article text.",
            }
          : {
              query:
                "Ticker detail filters the same shared snapshot by exact ticker_sentiment evidence.",
              ordering:
                "TICKER_RELEVANCE_THEN_PUBLISHED_AT",
              relation:
                "Every returned item contains exact ticker evidence for the requested ticker.",
              content:
                "Underly preserves source headline, publication timestamp, outbound URL, topics and ticker evidence. It does not generate article text.",
            },
    });
  } catch (error) {
    const failure = classifyNewsProviderFailure(error);

    return NextResponse.json(
      {
        version: "0.2",
        generatedAt: new Date().toISOString(),
        scope,
        ticker: scope === "ticker" ? ticker : null,
        status: "UNAVAILABLE",
        provider: configured.provider.id,
        cache: null,
        items: [],
        reasonCode: failure.reasonCode,
        message: failure.publicMessage,
      },
      { status: 502 },
    );
  }
}
