import { buildSwapTransaction } from "@/lib/binance/preflight-transaction";
import Decimal from "decimal.js";
import { NextRequest, NextResponse } from "next/server";

import { requiredEnv } from "@/lib/binance/auth";
import {
  getRwaPrice,
  getUnderlyingMarket,
  getUnderlyingProfile,
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import {
  getAggregatorQuote,
  type AggregatorQuoteRoute,
} from "@/lib/binance/trading";
import { simulateEvmTransaction } from "@/lib/binance/transaction";
import { buildCorporateActionSignal } from "@/lib/underly/actions";
import {
  buildCurrentEconomicSnapshot,
  tokenQuantityToUnderlyingShares,
} from "@/lib/underly/equivalence";
import { buildIntegrity } from "@/lib/underly/integrity";
import { buildPassport } from "@/lib/underly/passport";
import {
  classifyPreflight,
  inspectSimulationDirection,
  overallPreflightStatus,
  simulationStateFromResult,
  type PreflightSimulationState,
  type SimulationDirectionState,
} from "@/lib/underly/preflight";
import {
  PreflightRequestSchema,
  type PreflightRequest,
} from "@/lib/schemas/preflight";

export const runtime = "nodejs";

const BSC_USDT =
  "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const MAX_WRAPPERS = 6;
const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

function toRaw(amount: Decimal, decimals: number): string {
  return amount
    .mul(new PreciseDecimal(10).pow(decimals))
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .toFixed(0);
}

function fromRaw(raw: string, decimals: number): Decimal {
  return new PreciseDecimal(raw).div(
    new PreciseDecimal(10).pow(decimals),
  );
}

function parsedDecimals(
  value: string | number | undefined | null,
): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 36
    ? parsed
    : null;
}

function firstRoute(
  data: AggregatorQuoteRoute[] | null | undefined,
): AggregatorQuoteRoute | null {
  return Array.isArray(data) && data.length ? data[0] : null;
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

function dedupeAssets(
  rows: RwaTokenListRow[],
  chainId: string,
  ticker: string,
): RwaTokenListRow[] {
  const seen = new Set<string>();
  const result: RwaTokenListRow[] = [];

  for (const asset of rows) {
    if (String(asset.binanceChainId) !== chainId) continue;
    if (
      (asset.underlyingTicker ?? "").trim().toUpperCase() !== ticker
    ) {
      continue;
    }

    const key = asset.tokenContractAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result
    .sort(
      (a, b) =>
        (a.platformId ?? "").localeCompare(b.platformId ?? "") ||
        a.tokenSymbol.localeCompare(b.tokenSymbol),
    )
    .slice(0, MAX_WRAPPERS);
}

function currentReferenceValue(params: {
  underlyingShares: string | null;
  referencePriceUsd: string | null;
}): string | null {
  if (!params.underlyingShares || !params.referencePriceUsd) return null;

  try {
    return transport(
      new PreciseDecimal(params.underlyingShares).mul(
        params.referencePriceUsd,
      ),
    );
  } catch {
    return null;
  }
}

function roundTrip(params: {
  benchmarkUsd: Decimal;
  recoveredRaw: string | null;
  recoveredDecimals: number | null;
}) {
  if (!params.recoveredRaw || params.recoveredDecimals === null) {
    return {
      recoveredUsd: null,
      recoveryPct: null,
      frictionPct: null,
    };
  }

  const recovered = fromRaw(
    params.recoveredRaw,
    params.recoveredDecimals,
  );
  const recoveryPct = recovered.div(params.benchmarkUsd).mul(100);
  const friction = PreciseDecimal.max(
    params.benchmarkUsd.minus(recovered),
    0,
  )
    .div(params.benchmarkUsd)
    .mul(100);

  return {
    recoveredUsd: transport(recovered),
    recoveryPct: transport(recoveryPct),
    frictionPct: transport(friction),
  };
}

function publicBuildView(params: {
  code: number | null;
  message: string | null;
  txTo: string | null;
  executionMode: string | null;
}) {
  return {
    available: params.code === 0 && Boolean(params.txTo),
    upstreamCode: params.code,
    upstreamMessage: params.message,
    executionMode: params.executionMode,
    transactionTarget: params.txTo,
    calldataReturned: false,
  };
}

async function buildCandidate(params: {
  asset: RwaTokenListRow;
  chainId: string;
  request: PreflightRequest;
  quoteWallet: string;
}) {
  const { asset, chainId, request, quoteWallet } = params;
  const amountUsd = new PreciseDecimal(request.amountUsd);
  const amountRaw = toRaw(amountUsd, USDT_DECIMALS);

  const [priceEnvelope, marketEnvelope, profileEnvelope] =
    await Promise.all([
      getRwaPrice(chainId, asset.tokenContractAddress),
      getUnderlyingMarket(chainId, asset.tokenContractAddress),
      getUnderlyingProfile(chainId, asset.tokenContractAddress),
    ]);

  const price =
    priceEnvelope.code === 0 ? priceEnvelope.data?.[0] ?? {} : {};
  const market =
    marketEnvelope.code === 0 ? marketEnvelope.data ?? {} : {};
  const profile =
    profileEnvelope.code === 0 ? profileEnvelope.data ?? {} : {};

  const tokenPriceUsd = price.tokenPrice ?? asset.tokenPrice ?? null;
  const referencePriceUsd =
    price.referencePrice ?? asset.referencePrice ?? null;
  const tokenShareRatio =
    profile.tokenToShareRatio ?? asset.tokenToShareRatio ?? null;

  const economic = buildCurrentEconomicSnapshot({
    tokenPriceUsd,
    referencePriceUsd,
    tokenShareRatio,
  });

  const passport = buildPassport(asset.platformId, {
    ...profile,
    tokenToShareRatio: tokenShareRatio ?? undefined,
  });
  const attestationAvailable =
    passport.attestation.daily === "AVAILABLE"
      ? true
      : passport.attestation.daily === "UNAVAILABLE"
        ? false
        : null;
  const integrity = buildIntegrity({
    tokenShareRatio: tokenShareRatio ?? undefined,
    referencePrice: referencePriceUsd ?? undefined,
    attestationAvailable,
  });

  const statusInfo =
    market.statusInfo ?? asset.statusInfo ?? null;
  const corporateActions = buildCorporateActionSignal({
    statusInfoAvailable: statusInfo !== null,
    tradingAvailable: statusInfo?.openState ?? null,
    marketStatus: statusInfo?.marketStatus ?? null,
    reasonCode: statusInfo?.reasonCode ?? null,
    reasonMessage: statusInfo?.reasonMsg ?? null,
  });

  const entryEnvelope = await getAggregatorQuote({
    chainId,
    amountRaw,
    fromToken: BSC_USDT,
    toToken: asset.tokenContractAddress,
    wallet: quoteWallet,
  });
  const entryRoute =
    entryEnvelope.code === 0 ? firstRoute(entryEnvelope.data) : null;

  const tokenDecimals =
    parsedDecimals(entryRoute?.toToken?.decimal) ??
    parsedDecimals(asset.decimals);
  const tokenAmount =
    entryRoute?.toTokenAmount && tokenDecimals !== null
      ? transport(fromRaw(entryRoute.toTokenAmount, tokenDecimals))
      : null;
  const underlyingShares = tokenQuantityToUnderlyingShares({
    tokenQuantity: tokenAmount,
    tokenShareRatio: economic.tokenShareRatio,
  });
  const referenceValueUsd = currentReferenceValue({
    underlyingShares,
    referencePriceUsd: economic.referencePriceUsd,
  });

  let simulationState: PreflightSimulationState = "NOT_REQUESTED";
  let simulationDirection: SimulationDirectionState = "NOT_APPLICABLE";
  let simulationFailReason: string | null = null;
  let simulationBalanceChanges: Array<{
    contractAddress: string | null;
    tokenType: string | null;
    change: string | null;
    owner: string | null;
  }> = [];
  let simulationAllowanceChanges: Array<{
    tokenAddress: string | null;
    owner: string | null;
    spender: string | null;
    preAmount: string | null;
    postAmount: string | null;
  }> = [];
  let buildCode: number | null = null;
  let buildMessage: string | null = null;
  let buildTxTarget: string | null = null;
  let buildExecutionMode: string | null = null;

  if (request.walletAddress) {
    if (corporateActions.status === "ACTIVE") {
      simulationState = "SKIPPED_POLICY";
    } else if (!entryRoute?.quoteId) {
      simulationState = "BUILD_UNAVAILABLE";
      buildCode = entryEnvelope.code;
      buildMessage = entryEnvelope.msg;
    } else {
      try {
        const built = await buildSwapTransaction({
          chainId,
          amountRaw,
          fromToken: BSC_USDT,
          toToken: asset.tokenContractAddress,
          wallet: request.walletAddress,
          quoteId: entryRoute.quoteId,
          slippagePercent: request.slippagePercent,
        });

        buildCode = built.code;
        buildMessage = built.msg;
        buildExecutionMode = built.data?.executionMode ?? null;
        const tx = built.data?.tx ?? null;
        buildTxTarget = tx?.to ?? null;

        if (
          built.code !== 0 ||
          !tx?.from ||
          !tx.to ||
          tx.value === undefined ||
          !tx.data
        ) {
          simulationState = "BUILD_UNAVAILABLE";
        } else {
          const simulated = await simulateEvmTransaction({
            chainId,
            tx: {
              from: tx.from,
              to: tx.to,
              value: tx.value,
              data: tx.data,
            },
          });

          if (simulated.code !== 0 || !simulated.data) {
            simulationState = "UPSTREAM_ERROR";
            simulationFailReason = simulated.msg;
          } else {
            simulationState = simulationStateFromResult({
              status: simulated.data.status,
              failReason: simulated.data.failReason,
            });
            simulationFailReason =
              simulated.data.failReason ?? null;
            simulationBalanceChanges = (
              simulated.data.balanceChanges ?? []
            ).map((change) => ({
              contractAddress: change.contractAddress ?? null,
              tokenType: change.tokenType ?? null,
              change: change.change ?? null,
              owner: change.owner ?? null,
            }));
            simulationAllowanceChanges = (
              simulated.data.allowanceChanges ?? []
            ).map((change) => ({
              tokenAddress: change.tokenAddress ?? null,
              owner: change.owner ?? null,
              spender: change.spender ?? null,
              preAmount: change.preAmount ?? null,
              postAmount: change.postAmount ?? null,
            }));

            if (simulationState === "SUCCESS") {
              simulationDirection = inspectSimulationDirection({
                changes: simulationBalanceChanges,
                walletAddress: request.walletAddress,
                spendTokenAddress: BSC_USDT,
                receiveTokenAddress: asset.tokenContractAddress,
              }).state;
            }
          }
        }
      } catch (error) {
        simulationState = "UPSTREAM_ERROR";
        simulationFailReason =
          error instanceof Error ? error.message : "Simulation request failed";
      }
    }
  }

  let reverseEnvelopeCode: number | null = null;
  let reverseEnvelopeMessage: string | null = null;
  let reverseRoute: AggregatorQuoteRoute | null = null;

  if (entryRoute?.toTokenAmount) {
    try {
      const reverseEnvelope = await getAggregatorQuote({
        chainId,
        amountRaw: entryRoute.toTokenAmount,
        fromToken: asset.tokenContractAddress,
        toToken: BSC_USDT,
        wallet: quoteWallet,
      });
      reverseEnvelopeCode = reverseEnvelope.code;
      reverseEnvelopeMessage = reverseEnvelope.msg;
      reverseRoute =
        reverseEnvelope.code === 0
          ? firstRoute(reverseEnvelope.data)
          : null;
    } catch (error) {
      reverseEnvelopeMessage =
        error instanceof Error ? error.message : "Reverse quote failed";
    }
  }

  const reverseDecimals =
    parsedDecimals(reverseRoute?.toToken?.decimal) ?? USDT_DECIMALS;
  const roundTripView = roundTrip({
    benchmarkUsd: amountUsd,
    recoveredRaw: reverseRoute?.toTokenAmount ?? null,
    recoveredDecimals: reverseRoute ? reverseDecimals : null,
  });

  const decision = classifyPreflight({
    economicAvailable: Boolean(
      economic.tokenShareRatio &&
        economic.tokenPriceUsd &&
        economic.referencePriceUsd &&
        economic.shareEquivalentPriceUsd &&
        economic.referenceGapPct !== null &&
        underlyingShares,
    ),
    quoteAvailable: Boolean(entryRoute?.toTokenAmount),
    reverseQuoteAvailable: Boolean(reverseRoute?.toTokenAmount),
    corporateActionStatus: corporateActions.status,
    integrityStatus: integrity.status,
    tradingAvailable: statusInfo?.openState ?? null,
    simulationState,
    simulationDirection,
    referenceGapPct: economic.referenceGapPct,
    maxReferenceGapPct: request.maxReferenceGapPct ?? null,
  });

  return {
    provider: asset.platformId?.trim() || "unknown",
    symbol: asset.tokenSymbol,
    contractAddress: asset.tokenContractAddress,
    chainId,
    decision,
    economic: {
      ...economic,
      quotedTokenAmount: tokenAmount,
      quotedUnderlyingShares: underlyingShares,
      quotedReferenceValueUsd: referenceValueUsd,
    },
    marketSession: {
      tradingAvailable: statusInfo?.openState ?? null,
      status: statusInfo?.marketStatus ?? null,
      reasonCode: statusInfo?.reasonCode ?? null,
      reasonMessage: statusInfo?.reasonMsg ?? null,
      nextOpenAt: statusInfo?.nextOpenTime ?? null,
      nextCloseAt: statusInfo?.nextCloseTime ?? null,
    },
    integrity: {
      ...integrity,
      attestation: passport.attestation,
      dataCompleteness: passport.dataCompleteness,
      missingFields: passport.missingFields,
    },
    corporateActions,
    quote: {
      state: entryRoute?.toTokenAmount ? "AVAILABLE" : "UNAVAILABLE",
      vendor: entryRoute?.vendorName ?? null,
      executionMode: entryRoute?.executionMode ?? null,
      priceImpactPercent: entryRoute?.priceImpactPercent ?? null,
      tradeFee: entryRoute?.tradeFee ?? null,
      estimateGasFee: entryRoute?.estimateGasFee ?? null,
      upstreamCode: entryRoute ? 0 : entryEnvelope.code,
      upstreamMessage: entryRoute ? "success" : entryEnvelope.msg,
      quoteIdReturned: Boolean(entryRoute?.quoteId),
      reverse: {
        available: Boolean(reverseRoute?.toTokenAmount),
        vendor: reverseRoute?.vendorName ?? null,
        upstreamCode: reverseRoute ? 0 : reverseEnvelopeCode,
        upstreamMessage: reverseRoute ? "success" : reverseEnvelopeMessage,
        ...roundTripView,
      },
    },
    simulation: {
      requested: Boolean(request.walletAddress),
      state: simulationState,
      failReason: simulationFailReason,
      direction: simulationDirection,
      build: publicBuildView({
        code: buildCode,
        message: buildMessage,
        txTo: buildTxTarget,
        executionMode: buildExecutionMode,
      }),
      balanceChanges: simulationBalanceChanges,
      allowanceChanges: simulationAllowanceChanges,
      rawTransactionReturned: false,
    },
    sources: [
      {
        source: "Binance Web3 API",
        endpoint: "RWA Price",
        upstreamCode: priceEnvelope.code,
      },
      {
        source: "Binance Web3 API",
        endpoint: "Underlying Market",
        upstreamCode: marketEnvelope.code,
      },
      {
        source: "Binance Web3 API",
        endpoint: "Underlying Profile",
        upstreamCode: profileEnvelope.code,
      },
      {
        source: "Binance Web3 API",
        endpoint: "Aggregator Quote",
        upstreamCode: entryRoute ? 0 : entryEnvelope.code,
      },
      ...(request.walletAddress
        ? [
            {
              source: "Binance Web3 API",
              endpoint: "Build Swap Transaction + Transaction Simulation",
              upstreamCode:
                simulationState === "UPSTREAM_ERROR" ? null : buildCode,
            },
          ]
        : []),
    ],
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = PreflightRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid preflight request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const preflightRequest = {
    ...parsed.data,
    ticker: parsed.data.ticker.toUpperCase(),
  };
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";

  let quoteWallet: string;
  try {
    quoteWallet =
      preflightRequest.walletAddress ??
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
      universe.data ?? [],
      chainId,
      preflightRequest.ticker,
    );

    if (!assets.length) {
      return NextResponse.json(
        {
          error: `No BSC tokenized-equity representation found for ${preflightRequest.ticker}`,
        },
        { status: 404 },
      );
    }

    const candidates = [];
    // Sequential by design: each candidate can make quote/build/simulation calls,
    // and quoteId is short-lived. Avoid a burst across every wrapper.
    for (const asset of assets) {
      candidates.push(
        await buildCandidate({
          asset,
          chainId,
          request: preflightRequest,
          quoteWallet,
        }),
      );
    }

    const status = overallPreflightStatus(
      candidates.map((candidate) => candidate.decision.status),
    );

    return NextResponse.json({
      version: "0.4",
      generatedAt: new Date().toISOString(),
      scope: "BSC_TOKENIZED_EQUITY_PREFLIGHT",
      mode: preflightRequest.walletAddress
        ? "WALLET_SIMULATION"
        : "QUOTE_ONLY",
      chainId,
      status,
      request: {
        ticker: preflightRequest.ticker,
        amountUsd: new PreciseDecimal(preflightRequest.amountUsd)
          .toSignificantDigits(24)
          .toFixed(),
        walletAddress: preflightRequest.walletAddress ?? null,
        maxReferenceGapPct:
          preflightRequest.maxReferenceGapPct ?? null,
        slippagePercent: preflightRequest.slippagePercent,
      },
      methodology: {
        noRanking:
          "Underly evaluates every discovered BSC representation independently and does not select a best wrapper or make an investment recommendation.",
        economicEquivalence:
          "Current quoted wrapper output is normalized into underlying-equivalent shares using the current verified tokenShareRatio semantics. Current ratios are never projected backward into history.",
        liquidity:
          "The same requested USDT notional is quoted into each wrapper. When entry output exists, Underly also requests an immediate full synthetic reverse quote. This is a current liquidity observation, not forecast P&L.",
        simulation:
          "When a public wallet address is supplied, Underly builds an unsigned swap from the live quote and submits only that unsigned transaction payload to Binance Transaction API simulation. Underly does not sign or broadcast it.",
        referenceGuard:
          "maxReferenceGapPct is optional and user-supplied. If present, exceeding or being unable to verify that guard blocks the candidate; Underly does not invent its own investment threshold.",
      },
      summary: {
        candidateCount: candidates.length,
        ready: candidates.filter(
          (candidate) => candidate.decision.status === "READY",
        ).length,
        review: candidates.filter(
          (candidate) => candidate.decision.status === "REVIEW",
        ).length,
        blocked: candidates.filter(
          (candidate) => candidate.decision.status === "BLOCKED",
        ).length,
      },
      candidates,
      readOnly: {
        privateKeyRequired: false,
        signatureRequested: false,
        transactionBroadcast: false,
        rawTransactionReturned: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Preflight request failed",
      },
      { status: 502 },
    );
  }
}
