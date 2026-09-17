import Decimal from "decimal.js";
import { NextRequest, NextResponse } from "next/server";

import { requiredEnv } from "@/lib/binance/auth";
import {
  getRwaPrice,
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import {
  runStandardizedLiquidityProbe,
  type LiquidityProbeState,
} from "@/lib/underly/liquidity";

export const runtime = "nodejs";

const POSITIVE_DECIMAL = /^\d+(?:\.\d+)?$/;

function validNotional(value: string): boolean {
  if (!POSITIVE_DECIMAL.test(value)) return false;
  try {
    return new Decimal(value).gt(0);
  } catch {
    return false;
  }
}

function dedupeAssets(
  assets: RwaTokenListRow[],
): RwaTokenListRow[] {
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

function overallStatus(
  states: LiquidityProbeState[],
): LiquidityProbeState {
  if (states.every((state) => state === "AVAILABLE")) {
    return "AVAILABLE";
  }
  if (states.every((state) => state === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  return "PARTIAL";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker =
    url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  const notionalUsd =
    url.searchParams.get("notionalUsd")?.trim() ?? "1000";

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

  if (!validNotional(notionalUsd)) {
    return NextResponse.json(
      { error: "notionalUsd must be a positive decimal string" },
      { status: 400 },
    );
  }

  const chainId = process.env.UNDERLY_CHAIN_ID || "56";
  const quoteWallet = requiredEnv("UNDERLY_QUOTE_WALLET");

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

    const assets = dedupeAssets(
      (universe.data ?? []).filter(
        (asset) =>
          String(asset.binanceChainId) === chainId &&
          (asset.underlyingTicker ?? "")
            .trim()
            .toUpperCase() === ticker,
      ),
    );

    if (!assets.length) {
      return NextResponse.json(
        { error: `No RWA wrappers found for ${ticker}` },
        { status: 404 },
      );
    }

    const wrappers = [];

    // Sequential on purpose: standardized probes can require two
    // aggregator calls per wrapper. Avoid bursting all wrappers at once.
    for (const asset of assets) {
      let tokenPriceUsd: string | null =
        asset.tokenPrice ?? null;
      let referencePriceUsd: string | null =
        asset.referencePrice ?? null;
      let priceCode: number | null = null;
      let priceMessage: string | null = null;

      try {
        const price = await getRwaPrice(
          chainId,
          asset.tokenContractAddress,
        );
        priceCode = price.code;
        priceMessage = price.msg;

        if (price.code === 0) {
          tokenPriceUsd =
            price.data?.[0]?.tokenPrice ??
            tokenPriceUsd;
          referencePriceUsd =
            price.data?.[0]?.referencePrice ??
            referencePriceUsd;
        }
      } catch (error) {
        priceMessage =
          error instanceof Error
            ? error.message
            : "RWA price request failed";
      }

      const probe = await runStandardizedLiquidityProbe({
        chainId,
        wrapperContract: asset.tokenContractAddress,
        quoteWallet,
        benchmarkNotionalUsd: notionalUsd,
        tokenPriceUsd,
        tokenDecimals: asset.decimals,
      });

      wrappers.push({
        provider: asset.platformId?.trim() || "unknown",
        symbol: asset.tokenSymbol,
        contractAddress: asset.tokenContractAddress,
        tokenShareRatio: asset.tokenToShareRatio ?? null,
        market: {
          tokenPriceUsd,
          referencePriceUsd,
          reportedVolume24H: asset.volume24H ?? null,
          reportedVolume24HComparability:
            "UNVERIFIED_ACROSS_PROVIDERS",
          session: {
            tradingAvailable:
              asset.statusInfo?.openState ?? null,
            status:
              asset.statusInfo?.marketStatus ?? null,
            reasonCode:
              asset.statusInfo?.reasonCode ?? null,
            reasonMessage:
              asset.statusInfo?.reasonMsg ?? null,
          },
        },
        probe,
        sources: {
          tokenList: {
            endpoint: "RWA Token List",
            upstreamCode: universe.code,
            upstreamMessage: universe.msg,
          },
          price: {
            endpoint: "RWA Price",
            upstreamCode: priceCode,
            upstreamMessage: priceMessage,
          },
          quote: {
            endpoint: "Aggregator Quote",
            observedAt: probe.quoteTimestamp,
          },
        },
      });
    }

    wrappers.sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.symbol.localeCompare(b.symbol),
    );

    const status = overallStatus(
      wrappers.map((wrapper) => wrapper.probe.state),
    );

    return NextResponse.json({
      version: "0.2",
      generatedAt: new Date().toISOString(),
      ticker,
      chainId,
      status,
      benchmarkNotionalUsd: new Decimal(notionalUsd)
        .toSignificantDigits(24)
        .toFixed(),
      methodology: {
        probe:
          "For each wrapper, Underly requests a current USDT-to-wrapper quote for the same benchmark notional and, when entry liquidity exists, immediately requests a full reverse wrapper-to-USDT quote using the synthetic entry output. This is a read-only current-liquidity observation, not a forecast or recommendation.",
        reportedVolume24H:
          "The RWA Token List volume24H value is preserved as upstream metadata. Cross-provider unit/aggregation comparability is not yet established and Underly does not rank providers from this field.",
        ranking:
          "No best-wrapper ranking or UI-owned liquidity threshold is produced by this endpoint.",
      },
      summary: {
        wrapperCount: wrappers.length,
        available: wrappers.filter(
          (wrapper) => wrapper.probe.state === "AVAILABLE",
        ).length,
        partial: wrappers.filter(
          (wrapper) => wrapper.probe.state === "PARTIAL",
        ).length,
        unavailable: wrappers.filter(
          (wrapper) => wrapper.probe.state === "UNAVAILABLE",
        ).length,
      },
      wrappers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Liquidity request failed",
      },
      { status: 502 },
    );
  }
}
