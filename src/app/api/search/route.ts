import { NextRequest, NextResponse } from "next/server";
import { searchRwa } from "@/lib/binance/rwa";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  try {
    const result = await searchRwa(q);
    if (result.code !== 0) {
      return NextResponse.json({ error: result.msg, upstreamCode: result.code }, { status: 502 });
    }

    const chain = process.env.UNDERLY_CHAIN_ID || "56";
    const data = (result.data ?? []).map((row) => ({
      ticker: row.ticker,
      companyName: row.companyName,
      wrappers: row.assets
        .filter((asset) => String(asset.binanceChainId) === chain)
        .map((asset) => ({
          platform: asset.platformId,
          symbol: asset.tokenSymbol,
          contractAddress: asset.tokenContractAddress,
          chainId: String(asset.binanceChainId),
        })),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed" }, { status: 502 });
  }
}
