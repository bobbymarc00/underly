import Decimal from "decimal.js";

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface CurrentEconomicSnapshot {
  tokenPriceUsd: string | null;
  referencePriceUsd: string | null;
  tokenShareRatio: string | null;
  shareEquivalentPriceUsd: string | null;
  referenceGapPct: string | null;
}

type Scalar = string | number | null | undefined;

function decimal(value: Scalar): Decimal | null {
  if (value === null || value === undefined || value === "") return null;

  try {
    const parsed = new PreciseDecimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function positiveDecimal(value: Scalar): Decimal | null {
  const parsed = decimal(value);
  return parsed && parsed.gt(0) ? parsed : null;
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

/**
 * Current Binance RWA semantics verified by Underly:
 *   reference/share price = token price / tokenShareRatio
 *
 * Therefore one wrapper token currently represents tokenShareRatio underlying
 * shares. This helper is CURRENT-SNAPSHOT ONLY. It must not be applied to
 * historical candles without timestamped ratio continuity evidence.
 */
export function buildCurrentEconomicSnapshot(params: {
  tokenPriceUsd?: Scalar;
  referencePriceUsd?: Scalar;
  tokenShareRatio?: Scalar;
}): CurrentEconomicSnapshot {
  const tokenPrice = positiveDecimal(params.tokenPriceUsd);
  const referencePrice = positiveDecimal(params.referencePriceUsd);
  const ratio = positiveDecimal(params.tokenShareRatio);

  const shareEquivalentPrice =
    tokenPrice && ratio ? tokenPrice.div(ratio) : null;

  const referenceGap =
    shareEquivalentPrice && referencePrice
      ? shareEquivalentPrice.div(referencePrice).minus(1).mul(100)
      : null;

  return {
    tokenPriceUsd: tokenPrice ? transport(tokenPrice) : null,
    referencePriceUsd: referencePrice ? transport(referencePrice) : null,
    tokenShareRatio: ratio ? transport(ratio) : null,
    shareEquivalentPriceUsd: shareEquivalentPrice
      ? transport(shareEquivalentPrice)
      : null,
    referenceGapPct: referenceGap ? transport(referenceGap) : null,
  };
}

export function tokenQuantityToUnderlyingShares(params: {
  tokenQuantity: Scalar;
  tokenShareRatio: Scalar;
}): string | null {
  const quantity = decimal(params.tokenQuantity);
  const ratio = positiveDecimal(params.tokenShareRatio);

  if (!quantity || quantity.lt(0) || !ratio) return null;
  return transport(quantity.mul(ratio));
}

export function underlyingSharesToTokenQuantity(params: {
  underlyingShares: Scalar;
  tokenShareRatio: Scalar;
}): string | null {
  const shares = decimal(params.underlyingShares);
  const ratio = positiveDecimal(params.tokenShareRatio);

  if (!shares || shares.lt(0) || !ratio) return null;
  return transport(shares.div(ratio));
}
