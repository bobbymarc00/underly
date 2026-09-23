import Decimal from "decimal.js";
import { NextRequest, NextResponse } from "next/server";

import { buildSwapTransaction } from "@/lib/binance/preflight-transaction";
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
import { ExecutionReadinessRequestSchema } from "@/lib/schemas/execution-readiness";
import { buildCorporateActionSignal } from "@/lib/underly/actions";
import {
  buildCurrentEconomicSnapshot,
  tokenQuantityToUnderlyingShares,
} from "@/lib/underly/equivalence";
import {
  buildApprovalEnvelope,
  classifyExecutionReadiness,
  inspectExecutionSimulationEffects,
  isReadinessSnapshotFresh,
} from "@/lib/underly/execution-readiness";
import { buildIntegrity } from "@/lib/underly/integrity";
import { buildPassport } from "@/lib/underly/passport";
import {
  classifyPreflight,
  simulationStateFromResult,
  type PreflightSimulationState,
  type SimulationDirectionState,
} from "@/lib/underly/preflight";

export const runtime = "nodejs";

const BSC_CHAIN_ID = "56";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const SNAPSHOT_TTL_MS = 60_000;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

function normalizeAddress(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function validAddress(value?: string | null): value is string {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function positiveRaw(value?: string | null): value is string {
  return Boolean(value && /^[0-9]+$/.test(value) && !/^0+$/.test(value));
}

function nonNegativeRaw(value?: string | null): value is string {
  return Boolean(value !== undefined && value !== null && /^[0-9]+$/.test(value));
}

function parsedDecimals(
  value: string | number | undefined | null,
): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 36
    ? parsed
    : null;
}

function fromRaw(raw: string, decimals: number): Decimal {
  return new PreciseDecimal(raw).div(
    new PreciseDecimal(10).pow(decimals),
  );
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

function firstRoute(
  routes: AggregatorQuoteRoute[] | null | undefined,
): AggregatorQuoteRoute | null {
  return Array.isArray(routes) && routes.length ? routes[0] : null;
}

function routeField(route: AggregatorQuoteRoute, key: string): unknown {
  return (route as unknown as Record<string, unknown>)[key];
}

function tokenField(token: unknown, key: string): unknown {
  return token && typeof token === "object"
    ? (token as Record<string, unknown>)[key]
    : undefined;
}

function routeTokenAddress(token: unknown): string | null {
  const actual = tokenField(token, "tokenContractAddress");
  const legacy = tokenField(token, "contractAddress");
  const value = typeof actual === "string" ? actual : typeof legacy === "string" ? legacy : null;
  return value && validAddress(value) ? value : null;
}

function routeTokenDecimals(token: unknown): number | null {
  const value = tokenField(token, "decimal");
  return typeof value === "string" || typeof value === "number"
    ? parsedDecimals(value)
    : null;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sameDecimal(left: string, right: string): boolean {
  try {
    return (
      new PreciseDecimal(left).isFinite() &&
      new PreciseDecimal(right).isFinite() &&
      new PreciseDecimal(left).eq(right)
    );
  } catch {
    return false;
  }
}

function quoteMatches(params: {
  route: AggregatorQuoteRoute;
  chainId: string;
  amountRaw: string;
  fromToken: string;
  toToken: string;
  fromTokenDecimals: number;
  toTokenDecimals: number;
  quoteIdRequired?: boolean;
  executionModeRequired?: boolean;
}): boolean {
  const {
    route,
    chainId,
    amountRaw,
    fromToken,
    toToken,
    fromTokenDecimals,
    toTokenDecimals,
    quoteIdRequired = true,
    executionModeRequired = true,
  } = params;
  const quoteId = routeField(route, "quoteId");
  const responseChainId = routeField(route, "binanceChainId");
  const fromAddress = routeTokenAddress(route.fromToken);
  const toAddress = routeTokenAddress(route.toToken);

  if (quoteIdRequired && !nonemptyString(quoteId)) return false;
  if (quoteId !== undefined && !nonemptyString(quoteId)) return false;
  if (String(responseChainId ?? "") !== chainId) return false;
  if (
    executionModeRequired &&
    (!nonemptyString(route.executionMode) ||
      route.executionMode.trim().toUpperCase() !== "SWAP")
  ) {
    return false;
  }
  if (!positiveRaw(route.fromTokenAmount) || route.fromTokenAmount !== amountRaw) {
    return false;
  }
  if (!positiveRaw(route.toTokenAmount)) return false;
  if (!fromAddress || normalizeAddress(fromAddress) !== normalizeAddress(fromToken)) return false;
  if (!toAddress || normalizeAddress(toAddress) !== normalizeAddress(toToken)) return false;
  if (routeTokenDecimals(route.fromToken) !== fromTokenDecimals) return false;
  if (routeTokenDecimals(route.toToken) !== toTokenDecimals) return false;
  return true;
}

function minimumReceiveAmount(
  quotedOutputRaw: string,
  slippagePercent: string,
): string {
  return new PreciseDecimal(quotedOutputRaw)
    .mul(new PreciseDecimal(100).minus(slippagePercent))
    .div(100)
    .floor()
    .toFixed(0);
}

function validateBuild(params: {
  walletAddress: string;
  amountRaw: string;
  wrapperAddress: string;
  quoteId: string;
  entryAmountRaw: string;
  wrapperDecimals: number;
  slippagePercent: string;
  executionMode: string;
  built: Awaited<ReturnType<typeof buildSwapTransaction>>;
}):
  | {
      valid: true;
      tx: { from: string; to: string; value: string; data: string };
      minimumReceiveAmountRaw: string;
    }
  | {
      valid: false;
      reason: string;
      assessmentTx?: { from: string; to: string; value: string; data: string };
      minimumReceiveAmountRaw?: string;
    } {
  const { built } = params;
  if (built.code !== 0 || !built.data?.tx) {
    return { valid: false, reason: "BUILD_UNAVAILABLE" };
  }

  const tx = built.data.tx;
  if (
    !validAddress(tx.from) ||
    normalizeAddress(tx.from) !== normalizeAddress(params.walletAddress)
  ) {
    return { valid: false, reason: "TRANSACTION_FROM_MISMATCH" };
  }
  if (
    !validAddress(tx.to) ||
    normalizeAddress(tx.to) === ZERO_ADDRESS
  ) {
    return { valid: false, reason: "TRANSACTION_TARGET_INVALID" };
  }
  if (!tx.data || !/^0x(?:[a-fA-F0-9]{2})+$/.test(tx.data)) {
    return { valid: false, reason: "TRANSACTION_CALLDATA_INVALID" };
  }
  if (!nonNegativeRaw(tx.value)) {
    return { valid: false, reason: "TRANSACTION_VALUE_INVALID" };
  }
  if (BigInt(tx.value) !== 0n) {
    return { valid: false, reason: "TRANSACTION_NATIVE_VALUE_NOT_ALLOWED" };
  }

  const evidence = built.data.routerResult;
  if (!evidence) {
    return { valid: false, reason: "BUILD_ROUTER_RESULT_MISSING" };
  }
  if (
    !quoteMatches({
      route: evidence,
      chainId: BSC_CHAIN_ID,
      amountRaw: params.amountRaw,
      fromToken: BSC_USDT,
      toToken: params.wrapperAddress,
      fromTokenDecimals: USDT_DECIMALS,
      toTokenDecimals: params.wrapperDecimals,
      quoteIdRequired: false,
      executionModeRequired: false,
    }) ||
    evidence.toTokenAmount !== params.entryAmountRaw ||
    !nonemptyString(built.data.executionMode) ||
    built.data.executionMode.trim() !== params.executionMode
  ) {
    return { valid: false, reason: "BUILD_EVIDENCE_CONTRADICTORY" };
  }

  if (built.data.rfq !== undefined && built.data.rfq !== null) {
    return { valid: false, reason: "UNSUPPORTED_RFQ_BUILD" };
  }
  if (tx.signatureData !== undefined && tx.signatureData !== null) {
    return { valid: false, reason: "UNSUPPORTED_SIGNATURE_METADATA" };
  }

  const expectedMinimum = minimumReceiveAmount(
    params.entryAmountRaw,
    params.slippagePercent,
  );
  if (
    !positiveRaw(tx.minReceiveAmount) ||
    tx.minReceiveAmount !== expectedMinimum
  ) {
    return { valid: false, reason: "MINIMUM_RECEIVE_AMOUNT_MISMATCH" };
  }
  if (
    !nonemptyString(tx.slippagePercent) ||
    !sameDecimal(tx.slippagePercent, params.slippagePercent)
  ) {
    return { valid: false, reason: "BUILD_SLIPPAGE_MISMATCH" };
  }

  const assessmentTx = {
    from: tx.from,
    to: tx.to,
    value: tx.value,
    data: tx.data,
  };
  if (!nonemptyString(evidence.quoteId)) {
    return {
      valid: false,
      reason: "BUILD_QUOTE_ID_UNCONFIRMED",
      assessmentTx,
      minimumReceiveAmountRaw: expectedMinimum,
    };
  }
  if (evidence.quoteId.trim() !== params.quoteId) {
    return { valid: false, reason: "BUILD_QUOTE_ID_MISMATCH" };
  }

  return {
    valid: true,
    tx: assessmentTx,
    minimumReceiveAmountRaw: expectedMinimum,
  };
}

function selectionError(
  rows: RwaTokenListRow[],
  contract: string,
  ticker: string,
): { status: number; error: string; code: string } | RwaTokenListRow {
  const addressRows = rows.filter(
    (row) =>
      normalizeAddress(row.tokenContractAddress) ===
      normalizeAddress(contract),
  );
  if (!addressRows.length) {
    return {
      status: 404,
      error: "The selected wrapper is not in the current BSC RWA universe.",
      code: "UNKNOWN_WRAPPER",
    };
  }

  const chainRow = addressRows.find(
    (row) => String(row.binanceChainId) === BSC_CHAIN_ID,
  );
  if (!chainRow) {
    return {
      status: 400,
      error: "The selected wrapper is not a BSC representation.",
      code: "WRONG_CHAIN",
    };
  }
  if (
    (chainRow.underlyingTicker ?? "").trim().toUpperCase() !== ticker
  ) {
    return {
      status: 400,
      error: "The selected wrapper does not match the requested ticker.",
      code: "TICKER_WRAPPER_MISMATCH",
    };
  }
  return chainRow;
}

function isSelectionError(
  result: ReturnType<typeof selectionError>,
): result is { status: number; error: string; code: string } {
  return "status" in result;
}

function referenceValue(params: {
  shares: string | null;
  referencePrice: string | null;
}): string | null {
  if (!params.shares || !params.referencePrice) return null;
  try {
    return transport(
      new PreciseDecimal(params.shares).mul(params.referencePrice),
    );
  } catch {
    return null;
  }
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

  const parsed = ExecutionReadinessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid execution-readiness request",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = {
    ...parsed.data,
    ticker: parsed.data.ticker.toUpperCase(),
    amountRaw: BigInt(parsed.data.amountRaw).toString(),
    slippagePercent: new PreciseDecimal(parsed.data.slippagePercent).toFixed(),
    maxReferenceGapPct: parsed.data.maxReferenceGapPct
      ? new PreciseDecimal(parsed.data.maxReferenceGapPct).toFixed()
      : undefined,
  };
  const snapshotTimestamp = new Date().toISOString();
  const expiresAt = new Date(
    Date.parse(snapshotTimestamp) + SNAPSHOT_TTL_MS,
  ).toISOString();

  try {
    const universe = await listBscRwaTokens(BSC_CHAIN_ID);
    if (universe.code !== 0) {
      return NextResponse.json(
        { error: universe.msg, upstreamCode: universe.code },
        { status: 502 },
      );
    }

    const selected = selectionError(
      universe.data ?? [],
      input.wrapperContractAddress,
      input.ticker,
    );
    if (isSelectionError(selected)) {
      return NextResponse.json(
        { error: selected.error, code: selected.code },
        { status: selected.status },
      );
    }

    const [priceEnvelope, marketEnvelope, profileEnvelope] =
      await Promise.all([
        getRwaPrice(BSC_CHAIN_ID, selected.tokenContractAddress),
        getUnderlyingMarket(BSC_CHAIN_ID, selected.tokenContractAddress),
        getUnderlyingProfile(BSC_CHAIN_ID, selected.tokenContractAddress),
      ]);

    const rawPrice =
      priceEnvelope.code === 0 ? priceEnvelope.data?.[0] : undefined;
    const rawMarket =
      marketEnvelope.code === 0 ? marketEnvelope.data : undefined;
    const rawProfile =
      profileEnvelope.code === 0 ? profileEnvelope.data : undefined;
    const priceAccepted = Boolean(
      rawPrice &&
        (!rawPrice.tokenContractAddress ||
          normalizeAddress(rawPrice.tokenContractAddress) ===
            normalizeAddress(selected.tokenContractAddress)),
    );
    const marketAccepted = Boolean(
      rawMarket &&
        (!rawMarket.binanceChainId ||
          String(rawMarket.binanceChainId) === BSC_CHAIN_ID) &&
        (!rawMarket.tokenContractAddress ||
          normalizeAddress(rawMarket.tokenContractAddress) ===
            normalizeAddress(selected.tokenContractAddress)),
    );
    const profileAccepted = Boolean(
      rawProfile &&
        (!rawProfile.binanceChainId ||
          String(rawProfile.binanceChainId) === BSC_CHAIN_ID) &&
        (!rawProfile.tokenContractAddress ||
          normalizeAddress(rawProfile.tokenContractAddress) ===
            normalizeAddress(selected.tokenContractAddress)) &&
        (!rawProfile.underlyingTicker ||
          rawProfile.underlyingTicker.trim().toUpperCase() ===
            input.ticker),
    );
    const price = priceAccepted ? rawPrice ?? {} : {};
    const market = marketAccepted ? rawMarket ?? {} : {};
    const profile = profileAccepted ? rawProfile ?? {} : {};

    // Execution readiness never promotes token-list fallback fields to fresh
    // evidence. Each value below must come from its dedicated current call.
    const tokenPriceUsd = price.tokenPrice ?? null;
    const referencePriceUsd = price.referencePrice ?? null;
    const tokenShareRatio = profile.tokenToShareRatio ?? null;
    const economic = buildCurrentEconomicSnapshot({
      tokenPriceUsd,
      referencePriceUsd,
      tokenShareRatio,
    });
    const passport = buildPassport(selected.platformId, {
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
    const statusInfo = market.statusInfo ?? null;
    const corporateActions = buildCorporateActionSignal({
      statusInfoAvailable: statusInfo !== null,
      tradingAvailable: statusInfo?.openState ?? null,
      marketStatus: statusInfo?.marketStatus ?? null,
      reasonCode: statusInfo?.reasonCode ?? null,
      reasonMessage: statusInfo?.reasonMsg ?? null,
    });
    const selectedTokenDecimals = parsedDecimals(selected.decimals);

    const entryEnvelope = await getAggregatorQuote({
      chainId: BSC_CHAIN_ID,
      amountRaw: input.amountRaw,
      fromToken: BSC_USDT,
      toToken: selected.tokenContractAddress,
      wallet: input.walletAddress,
    });
    const rawEntryRoute =
      entryEnvelope.code === 0 ? firstRoute(entryEnvelope.data) : null;
    const entryRoute =
      rawEntryRoute &&
      quoteMatches({
        route: rawEntryRoute,
        chainId: BSC_CHAIN_ID,
        amountRaw: input.amountRaw,
        fromToken: BSC_USDT,
        toToken: selected.tokenContractAddress,
        fromTokenDecimals: USDT_DECIMALS,
        toTokenDecimals: selectedTokenDecimals ?? -1,
      })
        ? rawEntryRoute
        : null;

    let reverseEnvelopeCode: number | null = null;
    let reverseEnvelopeMessage: string | null = null;
    let reverseRoute: AggregatorQuoteRoute | null = null;
    if (entryRoute?.toTokenAmount) {
      const reverseEnvelope = await getAggregatorQuote({
        chainId: BSC_CHAIN_ID,
        amountRaw: entryRoute.toTokenAmount,
        fromToken: selected.tokenContractAddress,
        toToken: BSC_USDT,
        wallet: input.walletAddress,
      });
      reverseEnvelopeCode = reverseEnvelope.code;
      reverseEnvelopeMessage = reverseEnvelope.msg;
      const rawReverse =
        reverseEnvelope.code === 0
          ? firstRoute(reverseEnvelope.data)
          : null;
      reverseRoute =
        rawReverse &&
        quoteMatches({
          route: rawReverse,
          chainId: BSC_CHAIN_ID,
          amountRaw: entryRoute.toTokenAmount,
          fromToken: selected.tokenContractAddress,
          toToken: BSC_USDT,
          fromTokenDecimals: selectedTokenDecimals ?? -1,
          toTokenDecimals: USDT_DECIMALS,
        })
          ? rawReverse
          : null;
    }

    const tokenDecimals = entryRoute
      ? routeTokenDecimals(entryRoute.toToken)
      : selectedTokenDecimals;
    const quotedTokenAmount =
      entryRoute?.toTokenAmount && tokenDecimals !== null
        ? transport(fromRaw(entryRoute.toTokenAmount, tokenDecimals))
        : null;
    const quotedUnderlyingShares = tokenQuantityToUnderlyingShares({
      tokenQuantity: quotedTokenAmount,
      tokenShareRatio: economic.tokenShareRatio,
    });
    const quotedReferenceValueUsd = referenceValue({
      shares: quotedUnderlyingShares,
      referencePrice: economic.referencePriceUsd,
    });
    const economicAvailable = Boolean(
      economic.tokenShareRatio &&
        economic.tokenPriceUsd &&
        economic.referencePriceUsd &&
        economic.shareEquivalentPriceUsd &&
        economic.referenceGapPct !== null &&
        quotedUnderlyingShares,
    );

    const knownDecision = classifyPreflight({
      economicAvailable,
      quoteAvailable: Boolean(entryRoute?.toTokenAmount),
      reverseQuoteAvailable: Boolean(reverseRoute?.toTokenAmount),
      corporateActionStatus: corporateActions.status,
      integrityStatus: integrity.status,
      tradingAvailable: statusInfo?.openState ?? null,
      simulationState: "NOT_REQUESTED",
      simulationDirection: "NOT_APPLICABLE",
      referenceGapPct: economic.referenceGapPct,
      maxReferenceGapPct: input.maxReferenceGapPct ?? null,
    });

    let simulationState: PreflightSimulationState = "SKIPPED_POLICY";
    let simulationDirection: SimulationDirectionState = "NOT_APPLICABLE";
    let simulationFailReason: string | null = null;
    let simulationEffectValidationReason: string | null = null;
    let balanceChanges: Array<{
      contractAddress: string | null;
      tokenType: string | null;
      change: string | null;
      owner: string | null;
    }> = [];
    let buildCode: number | null = null;
    let buildMessage: string | null = null;
    let buildReason: string | null = "SKIPPED_KNOWN_BLOCK";
    let buildExecutionMode: string | null = null;
    let validatedTx:
      | { from: string; to: string; value: string; data: string }
      | null = null;
    let assessmentTx:
      | { from: string; to: string; value: string; data: string }
      | null = null;
    let minimumReceiveAmountRaw: string | null = null;

    const entryQuoteId = nonemptyString(entryRoute?.quoteId)
      ? entryRoute.quoteId.trim()
      : null;
    if (
      knownDecision.status !== "BLOCKED" &&
      entryQuoteId &&
      selectedTokenDecimals !== null &&
      nonemptyString(entryRoute?.executionMode)
    ) {
      const built = await buildSwapTransaction({
        chainId: BSC_CHAIN_ID,
        amountRaw: input.amountRaw,
        fromToken: BSC_USDT,
        toToken: selected.tokenContractAddress,
        wallet: input.walletAddress,
        quoteId: entryQuoteId,
        slippagePercent: input.slippagePercent,
      });
      buildCode = built.code;
      buildMessage = built.msg;
      buildExecutionMode = built.data?.executionMode ?? null;
      const validation = validateBuild({
        walletAddress: input.walletAddress,
        amountRaw: input.amountRaw,
        wrapperAddress: selected.tokenContractAddress,
        quoteId: entryQuoteId,
        entryAmountRaw: entryRoute.toTokenAmount!,
        wrapperDecimals: selectedTokenDecimals,
        slippagePercent: input.slippagePercent,
        executionMode: entryRoute.executionMode.trim(),
        built,
      });
      buildReason = validation.valid ? null : validation.reason;

      if (validation.valid) {
        validatedTx = validation.tx;
        assessmentTx = validation.tx;
        minimumReceiveAmountRaw = validation.minimumReceiveAmountRaw;
      } else if (
        validation.assessmentTx &&
        validation.minimumReceiveAmountRaw
      ) {
        assessmentTx = validation.assessmentTx;
        minimumReceiveAmountRaw = validation.minimumReceiveAmountRaw;
      } else {
        simulationState = "BUILD_UNAVAILABLE";
      }

      if (assessmentTx && minimumReceiveAmountRaw) {
        const simulated = await simulateEvmTransaction({
          chainId: BSC_CHAIN_ID,
          tx: assessmentTx,
        });
        if (simulated.code !== 0 || !simulated.data) {
          simulationState = "UPSTREAM_ERROR";
          simulationFailReason = simulated.msg;
        } else {
          simulationState = simulationStateFromResult({
            status: simulated.data.status,
            failReason: simulated.data.failReason,
          });
          simulationFailReason = simulated.data.failReason?.trim() || null;
          const simulationBalanceChanges = Array.isArray(
            simulated.data.balanceChanges,
          )
            ? simulated.data.balanceChanges
            : null;
          const simulationAllowanceChanges = Array.isArray(
            simulated.data.allowanceChanges,
          )
            ? simulated.data.allowanceChanges
            : null;
          balanceChanges = (simulationBalanceChanges ?? []).map(
            (change) => ({
              contractAddress: change.contractAddress ?? null,
              tokenType: change.tokenType ?? null,
              change: change.change ?? null,
              owner: change.owner ?? null,
            }),
          );
          const effectEvidence = inspectExecutionSimulationEffects({
            changes: simulationBalanceChanges,
            allowanceChanges: simulationAllowanceChanges,
            walletAddress: input.walletAddress,
            spendTokenAddress: BSC_USDT,
            receiveTokenAddress: selected.tokenContractAddress,
            expectedSpendAmountRaw: input.amountRaw,
            minimumReceiveAmountRaw: minimumReceiveAmountRaw!,
            expectedAllowanceSpenderAddress: assessmentTx.to,
          });
          simulationDirection = effectEvidence.state;
          simulationEffectValidationReason = effectEvidence.reason;
        }
      }
    } else if (knownDecision.status !== "BLOCKED") {
      simulationState = "BUILD_UNAVAILABLE";
      buildReason = "QUOTE_ID_UNAVAILABLE";
    }

    const preflight = classifyPreflight({
      economicAvailable,
      quoteAvailable: Boolean(entryRoute?.toTokenAmount),
      reverseQuoteAvailable: Boolean(reverseRoute?.toTokenAmount),
      corporateActionStatus: corporateActions.status,
      integrityStatus: integrity.status,
      tradingAvailable: statusInfo?.openState ?? null,
      simulationState,
      simulationDirection,
      referenceGapPct: economic.referenceGapPct,
      maxReferenceGapPct: input.maxReferenceGapPct ?? null,
    });
    const snapshotFresh = isReadinessSnapshotFresh({
      snapshotTimestamp,
      expiresAt,
    });
    const readiness = classifyExecutionReadiness({
      preflightStatus: preflight.status,
      quoteAvailable: Boolean(entryRoute?.toTokenAmount),
      quoteIdAvailable: Boolean(entryQuoteId),
      buildAvailable: Boolean(validatedTx),
      unsignedBuildAvailable: Boolean(assessmentTx),
      buildValidationReason: buildReason,
      simulationState,
      simulationDirection,
      snapshotFresh,
    });

    const approvalEnvelope =
      readiness.status === "EXECUTION_READY" &&
      entryQuoteId &&
      minimumReceiveAmountRaw &&
      validatedTx
        ? buildApprovalEnvelope({
            chainId: BSC_CHAIN_ID,
            walletAddress: input.walletAddress,
            ticker: input.ticker,
            fromTokenAddress: BSC_USDT,
            toTokenAddress: selected.tokenContractAddress,
            amountRaw: input.amountRaw,
            quotedOutputAmountRaw: entryRoute!.toTokenAmount!,
            minimumReceiveAmountRaw,
            quoteId: entryQuoteId,
            slippagePercent: input.slippagePercent,
            callFrom: validatedTx.from,
            callTarget: validatedTx.to,
            callValue: validatedTx.value,
            callData: validatedTx.data,
            snapshotTimestamp,
            expiresAt,
          })
        : null;

    const amountUsdt = transport(fromRaw(input.amountRaw, USDT_DECIMALS));
    return NextResponse.json({
      version: "0.6-B",
      scope: "BSC_EXACT_EXECUTION_READINESS",
      status:
        readiness.status === "EXECUTION_READY"
          ? "READY"
          : readiness.status,
      executionReadinessStatus: readiness.status,
      snapshotTimestamp,
      expiresAt,
      snapshotFresh,
      request: {
        ticker: input.ticker,
        wrapperContractAddress: selected.tokenContractAddress,
        walletAddress: input.walletAddress,
        inputTokenAddress: BSC_USDT,
        amountRaw: input.amountRaw,
        amountUsdt,
        maxReferenceGapPct: input.maxReferenceGapPct ?? null,
        slippagePercent: input.slippagePercent,
      },
      selectedWrapper: {
        chainId: BSC_CHAIN_ID,
        ticker: input.ticker,
        provider: selected.platformId?.trim() || "unknown",
        symbol: selected.tokenSymbol,
        contractAddress: selected.tokenContractAddress,
      },
      economicExposure: {
        ...economic,
        quotedTokenAmount,
        quotedUnderlyingShares,
        quotedReferenceValueUsd,
      },
      marketSession: {
        tradingAvailable: statusInfo?.openState ?? null,
        status: statusInfo?.marketStatus ?? null,
        reasonCode: statusInfo?.reasonCode ?? null,
        reasonMessage: statusInfo?.reasonMsg ?? null,
      },
      integrity: {
        ...integrity,
        attestation: passport.attestation,
        dataCompleteness: passport.dataCompleteness,
        missingFields: passport.missingFields,
      },
      corporateActions,
      quote: {
        available: Boolean(entryRoute?.toTokenAmount),
        quoteId: entryQuoteId,
        vendor: entryRoute?.vendorName ?? null,
        executionMode: entryRoute?.executionMode ?? null,
        inputAmountRaw: input.amountRaw,
        outputAmountRaw: entryRoute?.toTokenAmount ?? null,
        priceImpactPercent: entryRoute?.priceImpactPercent ?? null,
        tradeFee: entryRoute?.tradeFee ?? null,
        estimateGasFee: entryRoute?.estimateGasFee ?? null,
        reverse: {
          available: Boolean(reverseRoute?.toTokenAmount),
          vendor: reverseRoute?.vendorName ?? null,
          recoveredUsdt:
            reverseRoute?.toTokenAmount
              ? transport(
                  fromRaw(
                    reverseRoute.toTokenAmount,
                    parsedDecimals(reverseRoute.toToken?.decimal) ??
                      USDT_DECIMALS,
                  ),
                )
              : null,
          upstreamCode: reverseRoute ? 0 : reverseEnvelopeCode,
          upstreamMessage: reverseRoute
            ? "success"
            : reverseEnvelopeMessage,
        },
      },
      build: {
        available: Boolean(assessmentTx),
        identityBindingConfirmed: Boolean(validatedTx),
        validationReason: buildReason,
        upstreamCode: buildCode,
        upstreamMessage: buildMessage,
        executionMode: buildExecutionMode,
        transactionTarget: assessmentTx?.to ?? null,
        minimumReceiveAmountRaw,
        calldataReturned: false,
        rawTransactionReturned: false,
      },
      simulation: {
        state: simulationState,
        direction: simulationDirection,
        failReason: simulationFailReason,
        effectValidationReason: simulationEffectValidationReason,
        balanceChanges,
      },
      preflight,
      readiness,
      approvalEnvelope,
      sources: [
        {
          source: "Binance Web3 API",
          endpoint: "RWA Token List",
          upstreamCode: universe.code,
          accepted: true,
        },
        {
          source: "Binance Web3 API",
          endpoint: "RWA Price",
          upstreamCode: priceEnvelope.code,
          accepted: priceAccepted,
        },
        {
          source: "Binance Web3 API",
          endpoint: "Underlying Market",
          upstreamCode: marketEnvelope.code,
          accepted: marketAccepted,
        },
        {
          source: "Binance Web3 API",
          endpoint: "Underlying Profile",
          upstreamCode: profileEnvelope.code,
          accepted: profileAccepted,
        },
        {
          source: "Binance Web3 API",
          endpoint: "Aggregator Quote",
          upstreamCode: entryEnvelope.code,
          accepted: Boolean(entryRoute),
        },
        {
          source: "Binance Web3 API",
          endpoint: "Build Swap Transaction",
          upstreamCode: buildCode,
          accepted: Boolean(assessmentTx),
        },
        {
          source: "Binance Web3 API",
          endpoint: "Transaction Simulation",
          upstreamCode:
            simulationState === "SUCCESS" ||
            simulationState === "ALLOWANCE_REQUIRED" ||
            simulationState === "FAILED"
              ? 0
              : null,
          accepted:
            simulationState === "SUCCESS" &&
            simulationDirection === "VERIFIED",
        },
      ],
      methodology: {
        explicitSelection:
          "Underly evaluates only the exact wrapper selected by the caller and never ranks or substitutes another representation.",
        assessmentScope:
          "Quote availability, unsigned-build availability, simulation outcome, execution readiness, and human-approval state are separate assessment results.",
        simulationLimit:
          "A successful provider simulation is predicted evidence only. It does not prove quote/build identity, authorize execution, or establish that a final transaction is safe to sign.",
        approvalBinding:
          "The digest binds only the canonical EVM call intent; it is not approval of a full unsigned transaction. Nonce, gas, and fee fields are not bound, and any final signable transaction requires those fields to be checked and newly approved.",
        expiration:
          "expiresAt is a local Underly freshness limit and does not guarantee that the upstream quote remains valid.",
      },
      humanApprovalRequired: true,
      humanApprovalRequested: false,
      approvalAuthorizationGranted: false,
      executionPermitted: false,
      signatureRequested: false,
      transactionBroadcast: false,
      rawTransactionReturned: false,
      privateKeyRequired: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Execution-readiness request failed",
      },
      { status: 502 },
    );
  }
}
