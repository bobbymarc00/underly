import { NextResponse } from "next/server";

import {
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";

export const runtime = "nodejs";

interface UniverseWrapper {
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | string | null;
  tokenShareRatio: string | null;
}

interface UniverseUnderlying {
  ticker: string;
  name: string;
  wrapperCount: number;
  providers: string[];
  wrappers: UniverseWrapper[];
}

function wrapperSort(a: UniverseWrapper, b: UniverseWrapper): number {
  return (
    a.platform.localeCompare(b.platform) ||
    a.symbol.localeCompare(b.symbol) ||
    a.contractAddress.localeCompare(b.contractAddress)
  );
}

function normalizedTicker(asset: RwaTokenListRow): string {
  return (asset.underlyingTicker ?? asset.tokenSymbol).trim().toUpperCase();
}

function normalizedName(asset: RwaTokenListRow, ticker: string): string {
  return (asset.underlyingFullName ?? asset.companyName ?? ticker).trim();
}

export async function GET() {
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";

  try {
    const result = await listBscRwaTokens(chainId);

    if (result.code !== 0) {
      return NextResponse.json(
        {
          error: result.msg,
          upstreamCode: result.code,
        },
        { status: 502 },
      );
    }

    const byTicker = new Map<
      string,
      {
        ticker: string;
        name: string;
        wrappers: UniverseWrapper[];
      }
    >();
    const seenContracts = new Set<string>();

    for (const asset of result.data ?? []) {
      if (String(asset.binanceChainId) !== chainId) continue;

      const contractKey = asset.tokenContractAddress.toLowerCase();
      if (seenContracts.has(contractKey)) continue;
      seenContracts.add(contractKey);

      const ticker = normalizedTicker(asset);
      const name = normalizedName(asset, ticker);
      const platform = asset.platformId?.trim() || "unknown";

      const wrapper: UniverseWrapper = {
        platform,
        symbol: asset.tokenSymbol,
        contractAddress: asset.tokenContractAddress,
        chainId: String(asset.binanceChainId),
        decimals: asset.decimals ?? null,
        tokenShareRatio: asset.tokenToShareRatio ?? null,
      };

      const existing = byTicker.get(ticker);
      if (existing) {
        existing.wrappers.push(wrapper);
        if (existing.name === ticker && name !== ticker) {
          existing.name = name;
        }
      } else {
        byTicker.set(ticker, {
          ticker,
          name,
          wrappers: [wrapper],
        });
      }
    }

    const underlyings: UniverseUnderlying[] = Array.from(byTicker.values())
      .map((entry) => {
        const wrappers = [...entry.wrappers].sort(wrapperSort);
        return {
          ticker: entry.ticker,
          name: entry.name,
          wrapperCount: wrappers.length,
          providers: Array.from(
            new Set(wrappers.map((wrapper) => wrapper.platform)),
          ).sort(),
          wrappers,
        };
      })
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

    const providerMap = new Map<
      string,
      {
        wrapperCount: number;
        underlyings: Set<string>;
      }
    >();

    for (const underlying of underlyings) {
      for (const wrapper of underlying.wrappers) {
        const current = providerMap.get(wrapper.platform) ?? {
          wrapperCount: 0,
          underlyings: new Set<string>(),
        };
        current.wrapperCount += 1;
        current.underlyings.add(underlying.ticker);
        providerMap.set(wrapper.platform, current);
      }
    }

    const providers = Array.from(providerMap.entries())
      .map(([id, stats]) => ({
        id,
        wrapperCount: stats.wrapperCount,
        underlyingCount: stats.underlyings.size,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const wrapperCount = underlyings.reduce(
      (total, underlying) => total + underlying.wrapperCount,
      0,
    );

    return NextResponse.json({
      version: "0.2",
      chainId,
      generatedAt: new Date().toISOString(),
      summary: {
        underlyingCount: underlyings.length,
        wrapperCount,
        providerCount: providers.length,
      },
      providers,
      underlyings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Universe discovery failed",
      },
      { status: 502 },
    );
  }
}
