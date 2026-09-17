import "server-only";

import Decimal from "decimal.js";

import {
  getAggregatorQuote,
  type AggregatorQuoteRoute,
} from "@/lib/binance/trading";

const BSC_USDT =
  "0x55d398326f99059fF775485246999027B3197955";
const USDT_DECIMALS = 18;
const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

export type LiquidityProbeState =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE";

export interface LiquidityRouteView {
  attempted: boolean;
  available: boolean;
  vendor: string | null;
  executionMode: string | null;
  priceImpactPercent: string | null;
  tradeFee: string | null;
  estimateGasFee: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}

export interface LiquidityLeg {
  benchmarkValueUsd: string;
  quotedValueUsd: string;
  frictionUsd: string;
  frictionPct: string;
  favorableDeltaUsd: string | null;
}

export interface StandardizedLiquidityProbe {
  methodology: "CURRENT_STANDARDIZED_ENTRY_REVERSE_PROBE";
  state: LiquidityProbeState;
  benchmarkNotionalUsd: string;
  quantitySource: "SYNTHETIC_ENTRY_OUTPUT" | null;
  tokenAmount: string | null;
  entry: LiquidityRouteView;
  exit: LiquidityRouteView;
  entryMark: LiquidityLeg | null;
  exitFromMark: LiquidityLeg | null;
  roundTrip: LiquidityLeg | null;
  executableValueUsd: string | null;
  quoteTimestamp: string;
}

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
  value: string | number | undefined,
): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 36
    ? parsed
    : null;
}

function positiveDecimal(value?: string | null): Decimal | null {
  if (!value) return null;
  try {
    const parsed = new PreciseDecimal(value);
    return parsed.gt(0) ? parsed : null;
  } catch {
    return null;
  }
}

function firstRoute(
  data: AggregatorQuoteRoute[] | null | undefined,
): AggregatorQuoteRoute | null {
  return Array.isArray(data) && data.length ? data[0] : null;
}

function emptyRoute(): LiquidityRouteView {
  return {
    attempted: false,
    available: false,
    vendor: null,
    executionMode: null,
    priceImpactPercent: null,
    tradeFee: null,
    estimateGasFee: null,
    errorCode: null,
    errorMessage: null,
  };
}

function routeView(params: {
  attempted: boolean;
  route: AggregatorQuoteRoute | null;
  code: number | null;
  message: string | null;
}): LiquidityRouteView {
  return {
    attempted: params.attempted,
    available: Boolean(params.route),
    vendor: params.route?.vendorName ?? null,
    executionMode: params.route?.executionMode ?? null,
    priceImpactPercent: params.route?.priceImpactPercent ?? null,
    tradeFee: params.route?.tradeFee ?? null,
    estimateGasFee: params.route?.estimateGasFee ?? null,
    errorCode: params.route ? null : params.code,
    errorMessage: params.route ? null : params.message,
  };
}

function leg(
  benchmark: Decimal.Value,
  quoted: Decimal.Value,
): LiquidityLeg {
  const benchmarkValue = new PreciseDecimal(benchmark);
  const quotedValue = new PreciseDecimal(quoted);
  const delta = quotedValue.minus(benchmarkValue);
  const friction = PreciseDecimal.max(
    benchmarkValue.minus(quotedValue),
    0,
  );
  const frictionPct = benchmarkValue.isZero()
    ? new PreciseDecimal(0)
    : friction.div(benchmarkValue).mul(100);

  return {
    benchmarkValueUsd: benchmarkValue
      .toSignificantDigits(24)
      .toFixed(),
    quotedValueUsd: quotedValue.toSignificantDigits(24).toFixed(),
    frictionUsd: friction.toSignificantDigits(24).toFixed(),
    frictionPct: frictionPct.toSignificantDigits(18).toFixed(),
    favorableDeltaUsd: delta.gt(0)
      ? delta.toSignificantDigits(24).toFixed()
      : null,
  };
}

export async function runStandardizedLiquidityProbe(params: {
  chainId: string;
  wrapperContract: string;
  quoteWallet: string;
  benchmarkNotionalUsd: string;
  tokenPriceUsd?: string | null;
  tokenDecimals?: number | string;
}): Promise<StandardizedLiquidityProbe> {
  const benchmark = new PreciseDecimal(params.benchmarkNotionalUsd);
  const tokenPrice = positiveDecimal(params.tokenPriceUsd);
  const quoteTimestamp = new Date().toISOString();

  const base: StandardizedLiquidityProbe = {
    methodology: "CURRENT_STANDARDIZED_ENTRY_REVERSE_PROBE",
    state: "UNAVAILABLE",
    benchmarkNotionalUsd: benchmark
      .toSignificantDigits(24)
      .toFixed(),
    quantitySource: null,
    tokenAmount: null,
    entry: emptyRoute(),
    exit: emptyRoute(),
    entryMark: null,
    exitFromMark: null,
    roundTrip: null,
    executableValueUsd: null,
    quoteTimestamp,
  };

  const buy = await getAggregatorQuote({
    chainId: params.chainId,
    amountRaw: toRaw(benchmark, USDT_DECIMALS),
    fromToken: BSC_USDT,
    toToken: params.wrapperContract,
    wallet: params.quoteWallet,
  });

  const buyRoute =
    buy.code === 0 ? firstRoute(buy.data) : null;

  base.entry = routeView({
    attempted: true,
    route: buyRoute,
    code: buy.code,
    message: buy.msg,
  });

  if (!buyRoute?.toTokenAmount) {
    return base;
  }

  base.quantitySource = "SYNTHETIC_ENTRY_OUTPUT";
  base.state = "PARTIAL";

  const tokenDecimals =
    parsedDecimals(buyRoute.toToken?.decimal) ??
    parsedDecimals(params.tokenDecimals);

  let tokenAmount: Decimal | null = null;
  let markedValue: Decimal | null = null;

  if (tokenDecimals !== null) {
    tokenAmount = fromRaw(
      buyRoute.toTokenAmount,
      tokenDecimals,
    );
    base.tokenAmount = tokenAmount
      .toSignificantDigits(24)
      .toFixed();

    if (tokenPrice) {
      markedValue = tokenAmount.mul(tokenPrice);
      base.entryMark = leg(benchmark, markedValue);
    }
  }

  const sell = await getAggregatorQuote({
    chainId: params.chainId,
    amountRaw: buyRoute.toTokenAmount,
    fromToken: params.wrapperContract,
    toToken: BSC_USDT,
    wallet: params.quoteWallet,
  });

  const sellRoute =
    sell.code === 0 ? firstRoute(sell.data) : null;

  base.exit = routeView({
    attempted: true,
    route: sellRoute,
    code: sell.code,
    message: sell.msg,
  });

  if (!sellRoute?.toTokenAmount) {
    return base;
  }

  const outDecimals =
    parsedDecimals(sellRoute.toToken?.decimal) ??
    USDT_DECIMALS;
  const recovered = fromRaw(
    sellRoute.toTokenAmount,
    outDecimals,
  );

  base.state = "AVAILABLE";
  base.executableValueUsd = recovered
    .toSignificantDigits(24)
    .toFixed();
  base.roundTrip = leg(benchmark, recovered);

  if (markedValue) {
    base.exitFromMark = leg(markedValue, recovered);
  }

  return base;
}
