import { NextRequest, NextResponse } from "next/server";

import { listBscRwaTokens } from "@/lib/binance/rwa";
import { buildBscAssetGraph } from "@/lib/underly/asset-graph";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.trim().toUpperCase() ?? null;

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

    const fullGraph = buildBscAssetGraph(universe.data ?? [], chainId);
    const graph = ticker
      ? fullGraph.filter((underlying) => underlying.ticker === ticker)
      : fullGraph;

    if (ticker && graph.length === 0) {
      return NextResponse.json(
        { error: `No BSC tokenized-equity representation found for ${ticker}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      version: "0.3",
      generatedAt: new Date().toISOString(),
      scope: "BSC_TOKENIZED_EQUITY_ASSET_GRAPH",
      chainId,
      ticker,
      summary: {
        underlyingCount: graph.length,
        deploymentCount: graph.reduce(
          (total, underlying) => total + underlying.deploymentCount,
          0,
        ),
        multiRepresentationCount: graph.filter(
          (underlying) => underlying.deploymentCount > 1,
        ).length,
      },
      methodology: {
        identity:
          "Underly models one economic underlying separately from its provider-specific token deployments.",
        equivalence:
          "Current share-equivalent price = current wrapper token price / current tokenShareRatio. Current wrapper-token quantity represents quantity × tokenShareRatio underlying-equivalent shares.",
        historicalBoundary:
          "Current tokenShareRatio semantics are not projected backward across historical candles without timestamped ratio continuity evidence.",
      },
      underlyings: graph,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Asset graph discovery failed",
      },
      { status: 502 },
    );
  }
}
