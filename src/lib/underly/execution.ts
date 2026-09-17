import "server-only";
import Decimal from "decimal.js";
import { getAggregatorQuote, type AggregatorQuoteRoute } from "@/lib/binance/trading";
import type { Intent } from "@/types";

export const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const PreciseDecimal = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });

function toRaw(amount: Decimal, decimals: number): string {
  return amount
    .mul(new PreciseDecimal(10).pow(decimals))
    .toDecimalPlaces(0, Decimal.ROUND_DOWN)
    .toFixed(0);
}

function fromRaw(raw: string, decimals: number): Decimal {
  return new PreciseDecimal(raw).div(new PreciseDecimal(10).pow(decimals));
}

function firstRoute(data: AggregatorQuoteRoute[] | null | undefined): AggregatorQuoteRoute | null {
  return Array.isArray(data) && data.length ? data[0] : null;
}

function parsedDecimals(value: number | string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 36 ? parsed : null;
}

function validPositiveDecimal(value?: string | null): Decimal | null {
  if (!value) return null;
  try {
    const parsed = new PreciseDecimal(value);
    return parsed.gt(0) ? parsed : null;
  } catch {
    return null;
  }
}

export type ExecutionMethodology =
  | "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE"
  | "CURRENT_DIRECT_EXIT_QUOTE"
  | "CURRENT_LIQUIDATION_VALUE"
  | "NOT_APPLICABLE";

export interface ExecutionRouteResult {
  attempted: boolean;
  available: boolean | null;
  vendor: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}

export type ExecutionBenchmark =
  | "REQUESTED_NOTIONAL"
  | "REQUESTED_POSITION_NOTIONAL"
  | "RWA_TOKEN_PRICE_MARK";

export interface ExecutionLegBreakdown {
  benchmark: ExecutionBenchmark;
  benchmarkValueUsd: string;
  quotedValueUsd: string;
  frictionUsd: string;
  frictionPct: string;
  favorableQuotedDeltaUsd: string | null;
}

export interface ExecutionBreakdown {
  entry: ExecutionLegBreakdown | null;
  exit: ExecutionLegBreakdown | null;
  roundTrip: ExecutionLegBreakdown | null;
}

export interface ExecutionResult {
  benchmarkNotionalUsd: string | null;
  methodology: ExecutionMethodology;
  quantitySource:
    | "SYNTHETIC_ENTRY_OUTPUT"
    | "DERIVED_FROM_TOKEN_PRICE"
    | "USER_SUPPLIED"
    | null;
  tokenAmount: string | null;
  entry: ExecutionRouteResult;
  exit: ExecutionRouteResult;
  breakdown: ExecutionBreakdown;
  executableValueUsd: string | null;
  currentHaircutUsd: string | null;
  currentHaircutPct: string | null;
  favorableQuotedDeltaUsd: string | null;
  quoteTimestamp: string;
}

function emptyRoute(): ExecutionRouteResult {
  return {
    attempted: false,
    available: null,
    vendor: null,
    errorCode: null,
    errorMessage: null,
  };
}

function baseResult(
  benchmarkNotionalUsd: string | null,
  methodology: ExecutionMethodology,
): ExecutionResult {
  return {
    benchmarkNotionalUsd: benchmarkNotionalUsd
      ? new PreciseDecimal(benchmarkNotionalUsd).toSignificantDigits(24).toFixed()
      : null,
    methodology,
    quantitySource: null,
    tokenAmount: null,
    entry: emptyRoute(),
    exit: emptyRoute(),
    breakdown: { entry: null, exit: null, roundTrip: null },
    executableValueUsd: null,
    currentHaircutUsd: null,
    currentHaircutPct: null,
    favorableQuotedDeltaUsd: null,
    quoteTimestamp: new Date().toISOString(),
  };
}

export function buildExecutionLegBreakdown(
  benchmark: ExecutionBenchmark,
  benchmarkValue: Decimal.Value,
  quotedValue: Decimal.Value,
): ExecutionLegBreakdown {
  const benchmarkAmount = new PreciseDecimal(benchmarkValue);
  const quotedAmount = new PreciseDecimal(quotedValue);
  const delta = quotedAmount.minus(benchmarkAmount);
  const friction = PreciseDecimal.max(benchmarkAmount.minus(quotedAmount), 0);
  const frictionPct = benchmarkAmount.isZero()
    ? new PreciseDecimal(0)
    : friction.div(benchmarkAmount).mul(100);

  return {
    benchmark,
    benchmarkValueUsd: benchmarkAmount.toSignificantDigits(24).toFixed(),
    quotedValueUsd: quotedAmount.toSignificantDigits(24).toFixed(),
    frictionUsd: friction.toSignificantDigits(24).toFixed(),
    frictionPct: frictionPct.toSignificantDigits(18).toFixed(),
    favorableQuotedDeltaUsd: delta.gt(0)
      ? delta.toSignificantDigits(24).toFixed()
      : null,
  };
}

function applyLegacyRecovery(
  base: ExecutionResult,
  comparison: ExecutionLegBreakdown,
): ExecutionResult {
  base.executableValueUsd = comparison.quotedValueUsd;
  base.currentHaircutUsd = comparison.frictionUsd;
  base.currentHaircutPct = comparison.frictionPct;
  base.favorableQuotedDeltaUsd = comparison.favorableQuotedDeltaUsd;
  return base;
}

async function analyzeBuyProbe(params: {
  chainId: string;
  amountUsd: string;
  wrapperContract: string;
  quoteWallet: string;
  tokenPriceUsd?: string;
}): Promise<ExecutionResult> {
  const amount = new PreciseDecimal(params.amountUsd);
  const base = baseResult(params.amountUsd, "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE");

  const buy = await getAggregatorQuote({
    chainId: params.chainId,
    amountRaw: toRaw(amount, USDT_DECIMALS),
    fromToken: BSC_USDT,
    toToken: params.wrapperContract,
    wallet: params.quoteWallet,
  });
  const buyRoute = buy.code === 0 ? firstRoute(buy.data) : null;

  base.entry = {
    attempted: true,
    available: Boolean(buyRoute),
    vendor: buyRoute?.vendorName ?? null,
    errorCode: buyRoute ? null : buy.code,
    errorMessage: buyRoute ? null : buy.msg,
  };

  if (!buyRoute?.toTokenAmount) return base;

  base.quantitySource = "SYNTHETIC_ENTRY_OUTPUT";
  const tokenDecimals = parsedDecimals(buyRoute.toToken?.decimal);
  let markedAcquiredValue: Decimal | null = null;

  if (tokenDecimals !== null) {
    const acquiredTokenAmount = fromRaw(buyRoute.toTokenAmount, tokenDecimals);
    base.tokenAmount = acquiredTokenAmount.toSignificantDigits(24).toFixed();

    const tokenPrice = validPositiveDecimal(params.tokenPriceUsd);
    if (tokenPrice) {
      markedAcquiredValue = acquiredTokenAmount.mul(tokenPrice);
      base.breakdown.entry = buildExecutionLegBreakdown(
        "REQUESTED_NOTIONAL",
        amount,
        markedAcquiredValue,
      );
    }
  }

  const sell = await getAggregatorQuote({
    chainId: params.chainId,
    amountRaw: buyRoute.toTokenAmount,
    fromToken: params.wrapperContract,
    toToken: BSC_USDT,
    wallet: params.quoteWallet,
  });
  const sellRoute = sell.code === 0 ? firstRoute(sell.data) : null;

  base.exit = {
    attempted: true,
    available: Boolean(sellRoute),
    vendor: sellRoute?.vendorName ?? null,
    errorCode: sellRoute ? null : sell.code,
    errorMessage: sellRoute ? null : sell.msg,
  };

  if (!sellRoute?.toTokenAmount) return base;

  const outDecimals = parsedDecimals(sellRoute.toToken?.decimal) ?? USDT_DECIMALS;
  const recovered = fromRaw(sellRoute.toTokenAmount, outDecimals);

  if (markedAcquiredValue) {
    base.breakdown.exit = buildExecutionLegBreakdown(
      "RWA_TOKEN_PRICE_MARK",
      markedAcquiredValue,
      recovered,
    );
  }

  base.breakdown.roundTrip = buildExecutionLegBreakdown(
    "REQUESTED_NOTIONAL",
    amount,
    recovered,
  );

  return applyLegacyRecovery(base, base.breakdown.roundTrip);
}

async function analyzeDirectExit(params: {
  chainId: string;
  amountUsd?: string;
  tokenAmount?: string;
  wrapperContract: string;
  quoteWallet: string;
  tokenPriceUsd?: string;
  tokenDecimals?: number | string;
  methodology: "CURRENT_DIRECT_EXIT_QUOTE" | "CURRENT_LIQUIDATION_VALUE";
}): Promise<ExecutionResult> {
  const tokenPrice = validPositiveDecimal(params.tokenPriceUsd);
  const suppliedTokenAmount = validPositiveDecimal(params.tokenAmount);
  const suppliedNotional = validPositiveDecimal(params.amountUsd);

  let tokenAmount: Decimal | null = null;
  let benchmarkNotional: Decimal | null = null;
  let quantitySource: ExecutionResult["quantitySource"] = null;

  if (suppliedTokenAmount) {
    tokenAmount = suppliedTokenAmount;
    quantitySource = "USER_SUPPLIED";

  if (tokenPrice) {
    benchmarkNotional = suppliedTokenAmount.mul(tokenPrice);
  }
} else if (suppliedNotional && tokenPrice) {
    tokenAmount = suppliedNotional.div(tokenPrice);
    benchmarkNotional = suppliedNotional;
    quantitySource = "DERIVED_FROM_TOKEN_PRICE";
  }

  const base = baseResult(
    benchmarkNotional?.toSignificantDigits(24).toFixed() ?? null,
    params.methodology,
  );
  base.quantitySource = quantitySource;
  base.tokenAmount = tokenAmount?.toSignificantDigits(24).toFixed() ?? null;

  const decimals = parsedDecimals(params.tokenDecimals);

  if (!tokenAmount) {
    base.exit.errorMessage = suppliedNotional && !tokenPrice
      ? "Token price unavailable; direct exit quantity could not be derived from amountUsd."
      : "A valid amountUsd or tokenAmount is required for direct exit analysis.";
    return base;
  }

  if (decimals === null) {
    base.exit.errorMessage = "Token decimals unavailable; direct exit quote was not attempted.";
    return base;
  }

  const sell = await getAggregatorQuote({
    chainId: params.chainId,
    amountRaw: toRaw(tokenAmount, decimals),
    fromToken: params.wrapperContract,
    toToken: BSC_USDT,
    wallet: params.quoteWallet,
  });
  const sellRoute = sell.code === 0 ? firstRoute(sell.data) : null;

  base.exit = {
    attempted: true,
    available: Boolean(sellRoute),
    vendor: sellRoute?.vendorName ?? null,
    errorCode: sellRoute ? null : sell.code,
    errorMessage: sellRoute ? null : sell.msg,
  };

  if (!sellRoute?.toTokenAmount) return base;

  const outDecimals = parsedDecimals(sellRoute.toToken?.decimal) ?? USDT_DECIMALS;
  const recovered = fromRaw(sellRoute.toTokenAmount, outDecimals);
  base.executableValueUsd = recovered.toSignificantDigits(24).toFixed();

  if (benchmarkNotional) {
    base.breakdown.exit = buildExecutionLegBreakdown(
      "REQUESTED_POSITION_NOTIONAL",
      benchmarkNotional,
      recovered,
    );
    return applyLegacyRecovery(base, base.breakdown.exit);
  }

  return base;
}

export async function analyzeExecution(params: {
  intent: Intent;
  chainId: string;
  amountUsd?: string;
  tokenAmount?: string;
  wrapperContract: string;
  quoteWallet: string;
  tokenPriceUsd?: string;
  tokenDecimals?: number | string;
}): Promise<ExecutionResult> {
  if (params.intent === "HOLD") {
    let markedNotional: string | null = params.amountUsd ?? null;
    if (!markedNotional && params.tokenAmount) {
      const tokenPrice = validPositiveDecimal(params.tokenPriceUsd);
      const tokenAmount = validPositiveDecimal(params.tokenAmount);
      if (tokenPrice && tokenAmount) {
        markedNotional = tokenPrice.mul(tokenAmount).toSignificantDigits(24).toFixed();
      }
    }

    const result = baseResult(markedNotional, "NOT_APPLICABLE");
    if (params.tokenAmount) {
      result.quantitySource = "USER_SUPPLIED";
      result.tokenAmount = params.tokenAmount;
    }
    return result;
  }

  if (params.intent === "BUY") {
    if (!params.amountUsd) {
      throw new Error("BUY execution requires amountUsd");
    }
    return analyzeBuyProbe({ ...params, amountUsd: params.amountUsd });
  }

  return analyzeDirectExit({
    ...params,
    methodology:
      params.intent === "SELL"
        ? "CURRENT_DIRECT_EXIT_QUOTE"
        : "CURRENT_LIQUIDATION_VALUE",
  });
}

