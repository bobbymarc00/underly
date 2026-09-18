import Decimal from "decimal.js";
import { NextRequest, NextResponse } from "next/server";

import { requiredEnv } from "@/lib/binance/auth";
import {
  getUnderlyingProfile,
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import {
  getAggregatorQuote,
  type AggregatorQuoteRoute,
} from "@/lib/binance/trading";
import {
  ContinuityRequestSchema,
  type ContinuityRequest,
} from "@/lib/schemas/continuity";
import { buildContinuityMetrics } from "@/lib/underly/continuity";
import { tokenQuantityToUnderlyingShares } from "@/lib/underly/equivalence";

export const runtime = "nodejs";

const BSC_USDT =
  "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const MAX_TARGETS = 6;

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

function decimal(
  value: string | number | null | undefined,
): Decimal | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  try {
    const parsed = new PreciseDecimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

function parsedDecimals(
  value: string | number | undefined | null,
): number | null {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 36
    ? parsed
    : null;
}

function toRaw(
  amount: Decimal,
  decimals: number,
): string {
  return amount
    .mul(new PreciseDecimal(10).pow(decimals))
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .toFixed(0);
}

function fromRaw(
  amount: string,
  decimals: number,
): Decimal {
  return new PreciseDecimal(amount).div(
    new PreciseDecimal(10).pow(decimals),
  );
}

function firstRoute(
  data: AggregatorQuoteRoute[] | null | undefined,
): AggregatorQuoteRoute | null {
  return Array.isArray(data) && data.length
    ? data[0]
    : null;
}

function normalizedTicker(
  asset: RwaTokenListRow,
): string {
  return (
    asset.underlyingTicker ??
    asset.tokenSymbol
  )
    .trim()
    .toUpperCase();
}

function sameAddress(
  left: string,
  right: string,
): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function dedupeTargets(
  rows: RwaTokenListRow[],
  chainId: string,
  ticker: string,
  sourceContract: string,
): RwaTokenListRow[] {
  const seen = new Set<string>();

  return rows
    .filter(
      (asset) =>
        String(asset.binanceChainId) === chainId &&
        normalizedTicker(asset) === ticker &&
        !sameAddress(
          asset.tokenContractAddress,
          sourceContract,
        ),
    )
    .filter((asset) => {
      const key =
        asset.tokenContractAddress.toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    })
    .sort(
      (a, b) =>
        (a.platformId ?? "").localeCompare(
          b.platformId ?? "",
        ) ||
        a.tokenSymbol.localeCompare(b.tokenSymbol),
    )
    .slice(0, MAX_TARGETS);
}

async function currentRatio(
  asset: RwaTokenListRow,
  chainId: string,
): Promise<{
  ratio: string | null;
  source:
    | "UNDERLYING_PROFILE"
    | "TOKEN_LIST"
    | "UNAVAILABLE";
}> {
  try {
    const profile = await getUnderlyingProfile(
      chainId,
      asset.tokenContractAddress,
    );

    const profileRatio =
      profile.code === 0
        ? decimal(profile.data?.tokenToShareRatio)
        : null;

    if (profileRatio && profileRatio.gt(0)) {
      return {
        ratio: transport(profileRatio),
        source: "UNDERLYING_PROFILE",
      };
    }
  } catch {
    // Fall through to current token-list evidence.
  }

  const listed = decimal(asset.tokenToShareRatio);

  if (listed && listed.gt(0)) {
    return {
      ratio: transport(listed),
      source: "TOKEN_LIST",
    };
  }

  return {
    ratio: null,
    source: "UNAVAILABLE",
  };
}

function continuityStatus(
  targets: Array<{
    continuity: {
      status: "AVAILABLE" | "UNAVAILABLE";
    };
  }>,
): "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" {
  if (!targets.length) return "UNAVAILABLE";

  const available = targets.filter(
    (target) =>
      target.continuity.status === "AVAILABLE",
  ).length;

  if (available === targets.length) {
    return "AVAILABLE";
  }

  if (available > 0) {
    return "PARTIAL";
  }

  return "UNAVAILABLE";
}

async function buildTarget(params: {
  asset: RwaTokenListRow;
  chainId: string;
  quoteWallet: string;
  recoveredUsdtRaw: string;
  sourceTokenAmount: string;
  sourceTokenShareRatio: string | null;
}) {
  const {
    asset,
    chainId,
    quoteWallet,
    recoveredUsdtRaw,
    sourceTokenAmount,
    sourceTokenShareRatio,
  } = params;

  const ratio = await currentRatio(asset, chainId);

  try {
    const envelope = await getAggregatorQuote({
      chainId,
      amountRaw: recoveredUsdtRaw,
      fromToken: BSC_USDT,
      toToken: asset.tokenContractAddress,
      wallet: quoteWallet,
    });

    const route =
      envelope.code === 0
        ? firstRoute(envelope.data)
        : null;

    const targetDecimals =
      parsedDecimals(route?.toToken?.decimal) ??
      parsedDecimals(asset.decimals);

    const targetTokenAmount =
      route?.toTokenAmount &&
      targetDecimals !== null
        ? transport(
            fromRaw(
              route.toTokenAmount,
              targetDecimals,
            ),
          )
        : null;

    const continuity = buildContinuityMetrics({
      sourceTokenAmount,
      sourceTokenShareRatio,
      targetTokenAmount,
      targetTokenShareRatio: ratio.ratio,
    });

    return {
      provider:
        asset.platformId?.trim() || "unknown",
      symbol: asset.tokenSymbol,
      contractAddress:
        asset.tokenContractAddress,
      tokenShareRatio: ratio.ratio,
      ratioSource: ratio.source,
      quote: {
        state:
          route?.toTokenAmount
            ? "AVAILABLE"
            : "UNAVAILABLE",
        vendor: route?.vendorName ?? null,
        executionMode:
          route?.executionMode ?? null,
        priceImpactPercent:
          route?.priceImpactPercent ?? null,
        tradeFee:
          route?.tradeFee ?? null,
        estimateGasFee:
          route?.estimateGasFee ?? null,
        quotedTokenAmount:
          targetTokenAmount,
        upstreamCode:
          route ? 0 : envelope.code,
        upstreamMessage:
          route ? "success" : envelope.msg,
      },
      continuity,
    };
  } catch (error) {
    return {
      provider:
        asset.platformId?.trim() || "unknown",
      symbol: asset.tokenSymbol,
      contractAddress:
        asset.tokenContractAddress,
      tokenShareRatio: ratio.ratio,
      ratioSource: ratio.source,
      quote: {
        state: "UNAVAILABLE",
        vendor: null,
        executionMode: null,
        priceImpactPercent: null,
        tradeFee: null,
        estimateGasFee: null,
        quotedTokenAmount: null,
        upstreamCode: null,
        upstreamMessage:
          error instanceof Error
            ? error.message
            : "Target quote failed",
      },
      continuity: buildContinuityMetrics({
        sourceTokenAmount,
        sourceTokenShareRatio,
        targetTokenAmount: null,
        targetTokenShareRatio: ratio.ratio,
      }),
    };
  }
}

export async function POST(
  request: NextRequest,
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Request body must be valid JSON",
      },
      { status: 400 },
    );
  }

  const parsed =
    ContinuityRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Invalid continuity request",
        issues: parsed.error.issues.map(
          (issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          }),
        ),
      },
      { status: 400 },
    );
  }

  const continuityRequest: ContinuityRequest =
    parsed.data;

  const chainId =
    process.env.UNDERLY_CHAIN_ID || "56";

  let quoteWallet: string;

  try {
    quoteWallet =
      continuityRequest.walletAddress ??
      requiredEnv("UNDERLY_QUOTE_WALLET");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "A quote wallet is required",
      },
      { status: 503 },
    );
  }

  try {
    const universe =
      await listBscRwaTokens(chainId);

    if (universe.code !== 0) {
      return NextResponse.json(
        {
          error: universe.msg,
          upstreamCode: universe.code,
        },
        { status: 502 },
      );
    }

    const rows = universe.data ?? [];

    const source = rows.find(
      (asset) =>
        String(asset.binanceChainId) ===
          chainId &&
        sameAddress(
          asset.tokenContractAddress,
          continuityRequest.sourceContractAddress,
        ),
    );

    if (!source) {
      return NextResponse.json(
        {
          error:
            "Source BSC tokenized-equity representation was not found",
        },
        { status: 404 },
      );
    }

    const sourceDecimals =
      parsedDecimals(source.decimals);

    if (sourceDecimals === null) {
      return NextResponse.json(
        {
          error:
            "Source token decimals are unavailable",
        },
        { status: 422 },
      );
    }

    const ticker =
      normalizedTicker(source);

    const sourceAmount =
      new PreciseDecimal(
        continuityRequest.sourceTokenAmount,
      );

    const sourceAmountRaw = toRaw(
      sourceAmount,
      sourceDecimals,
    );

    const sourceRatio =
      await currentRatio(source, chainId);

    const sourceUnderlyingShares =
      tokenQuantityToUnderlyingShares({
        tokenQuantity:
          continuityRequest.sourceTokenAmount,
        tokenShareRatio:
          sourceRatio.ratio,
      });

    const exitEnvelope =
      await getAggregatorQuote({
        chainId,
        amountRaw: sourceAmountRaw,
        fromToken:
          source.tokenContractAddress,
        toToken: BSC_USDT,
        wallet: quoteWallet,
      });

    const exitRoute =
      exitEnvelope.code === 0
        ? firstRoute(exitEnvelope.data)
        : null;

    const recoveredUsdtRaw =
      exitRoute?.toTokenAmount ?? null;

    const recoveredUsdt =
      recoveredUsdtRaw
        ? transport(
            fromRaw(
              recoveredUsdtRaw,
              USDT_DECIMALS,
            ),
          )
        : null;

    const targetAssets = dedupeTargets(
      rows,
      chainId,
      ticker,
      source.tokenContractAddress,
    );

    const targets = [];

    if (recoveredUsdtRaw) {
      // Sequential by design. Each target requires current
      // ratio evidence plus a live aggregator quote.
      for (const asset of targetAssets) {
        targets.push(
          await buildTarget({
            asset,
            chainId,
            quoteWallet,
            recoveredUsdtRaw,
            sourceTokenAmount:
              continuityRequest.sourceTokenAmount,
            sourceTokenShareRatio:
              sourceRatio.ratio,
          }),
        );
      }
    } else {
      for (const asset of targetAssets) {
        const ratio =
          await currentRatio(asset, chainId);

        targets.push({
          provider:
            asset.platformId?.trim() ||
            "unknown",
          symbol: asset.tokenSymbol,
          contractAddress:
            asset.tokenContractAddress,
          tokenShareRatio: ratio.ratio,
          ratioSource: ratio.source,
          quote: {
            state: "UNAVAILABLE",
            vendor: null,
            executionMode: null,
            priceImpactPercent: null,
            tradeFee: null,
            estimateGasFee: null,
            quotedTokenAmount: null,
            upstreamCode: null,
            upstreamMessage:
              "Source exit route unavailable",
          },
          continuity:
            buildContinuityMetrics({
              sourceTokenAmount:
                continuityRequest.sourceTokenAmount,
              sourceTokenShareRatio:
                sourceRatio.ratio,
              targetTokenAmount: null,
              targetTokenShareRatio:
                ratio.ratio,
            }),
        });
      }
    }

    const status =
      recoveredUsdtRaw
        ? continuityStatus(targets)
        : "UNAVAILABLE";

    return NextResponse.json({
      version: "0.5",
      generatedAt:
        new Date().toISOString(),
      scope:
        "BSC_TOKENIZED_EQUITY_CONTINUITY",
      chainId,
      ticker,
      status,
      request: {
        sourceContractAddress:
          continuityRequest.sourceContractAddress,
        sourceTokenAmount:
          transport(sourceAmount),
        walletAddress:
          continuityRequest.walletAddress ??
          null,
      },
      source: {
        provider:
          source.platformId?.trim() ||
          "unknown",
        symbol: source.tokenSymbol,
        contractAddress:
          source.tokenContractAddress,
        tokenShareRatio:
          sourceRatio.ratio,
        ratioSource:
          sourceRatio.source,
        tokenAmount:
          transport(sourceAmount),
        underlyingShares:
          sourceUnderlyingShares,
        exit: {
          state:
            recoveredUsdtRaw
              ? "AVAILABLE"
              : "UNAVAILABLE",
          recoveredUsdt,
          vendor:
            exitRoute?.vendorName ?? null,
          executionMode:
            exitRoute?.executionMode ??
            null,
          priceImpactPercent:
            exitRoute?.priceImpactPercent ??
            null,
          tradeFee:
            exitRoute?.tradeFee ?? null,
          estimateGasFee:
            exitRoute?.estimateGasFee ??
            null,
          upstreamCode:
            exitRoute
              ? 0
              : exitEnvelope.code,
          upstreamMessage:
            exitRoute
              ? "success"
              : exitEnvelope.msg,
        },
      },
      summary: {
        targetCount:
          targets.length,
        available:
          targets.filter(
            (target) =>
              target.continuity.status ===
              "AVAILABLE",
          ).length,
        unavailable:
          targets.filter(
            (target) =>
              target.continuity.status ===
              "UNAVAILABLE",
          ).length,
      },
      methodology: {
        continuity:
          "Underly measures current underlying-equivalent exposure before and after a live source-wrapper -> USDT -> target-wrapper quote path.",
        normalization:
          "Current token quantities are normalized with current tokenShareRatio evidence. Current ratios are never projected backward into history.",
        retention:
          "underlyingRetentionPct = target underlying-equivalent shares / source underlying-equivalent shares × 100.",
        noRanking:
          "Targets are returned as separately observed routes. Underly does not rank, recommend, or automatically select a destination wrapper.",
        executionBoundary:
          "This endpoint requests quotes only. It does not build, sign, approve, or broadcast a transaction.",
      },
      targets,
      readOnly: {
        privateKeyRequired: false,
        signatureRequested: false,
        approvalRequested: false,
        transactionBuilt: false,
        transactionBroadcast: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Continuity request failed",
      },
      { status: 502 },
    );
  }
}