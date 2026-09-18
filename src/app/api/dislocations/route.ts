import { NextRequest, NextResponse } from "next/server";

import { listBscRwaTokens } from "@/lib/binance/rwa";
import { buildBscAssetGraph } from "@/lib/underly/asset-graph";
import { buildDislocationItems } from "@/lib/underly/dislocation";

export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 6;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 6;
  return Math.min(Math.max(parsed, 1), 12);
}

function parseSession(value: string | null): "all" | "open" | "closed" {
  if (value === "open" || value === "closed") return value;
  return "all";
}

export async function GET(request: NextRequest) {
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const session = parseSession(request.nextUrl.searchParams.get("session"));

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

    const graph = buildBscAssetGraph(universe.data ?? [], chainId);
    const items = buildDislocationItems({ graph, session, limit });

    return NextResponse.json({
      version: "0.3",
      generatedAt: new Date().toISOString(),
      scope: "BSC_CURRENT_REFERENCE_DISLOCATION",
      chainId,
      session,
      status: items.length ? "AVAILABLE" : "EMPTY",
      methodology: {
        normalization:
          "Underly first normalizes each wrapper token into a current underlying-share-equivalent price using tokenShareRatio, then compares that normalized price with the wrapper's current reference price.",
        referenceGap:
          "referenceGapPct = (shareEquivalentPrice / referencePrice - 1) × 100.",
        ranking:
          "Closed-market observations are shown first for session=all, then observations are ordered by absolute current reference gap. This is evidence discovery, not an investment recommendation or profit estimate.",
        historicalBoundary:
          "No current tokenShareRatio is projected backward into historical candles.",
      },
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Dislocation discovery failed",
      },
      { status: 502 },
    );
  }
}
