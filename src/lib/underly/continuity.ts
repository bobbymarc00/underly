import Decimal from "decimal.js";

import {
  tokenQuantityToUnderlyingShares,
  underlyingSharesToTokenQuantity,
} from "./equivalence";

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

type Scalar = string | number | null | undefined;

export interface ContinuityMetrics {
  status: "AVAILABLE" | "UNAVAILABLE";
  sourceTokenAmount: string | null;
  sourceUnderlyingShares: string | null;
  targetTokenAmount: string | null;
  targetUnderlyingShares: string | null;
  parityTargetTokenAmount: string | null;
  underlyingRetentionPct: string | null;
  underlyingDeltaPct: string | null;
}

function decimal(value: Scalar): Decimal | null {
  if (value === null || value === undefined || value === "") {
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

/**
 * CURRENT-SNAPSHOT ONLY.
 *
 * Measures how much underlying-equivalent equity exposure survives when
 * moving from one tokenized representation to another representation of the
 * same underlying.
 *
 * No historical token/share ratio is inferred.
 * No wrapper is ranked or automatically selected.
 */
export function buildContinuityMetrics(params: {
  sourceTokenAmount: Scalar;
  sourceTokenShareRatio: Scalar;
  targetTokenAmount: Scalar;
  targetTokenShareRatio: Scalar;
}): ContinuityMetrics {
  const sourceTokenAmount = decimal(params.sourceTokenAmount);
  const targetTokenAmount = decimal(params.targetTokenAmount);

  const sourceUnderlyingShares = tokenQuantityToUnderlyingShares({
    tokenQuantity: params.sourceTokenAmount,
    tokenShareRatio: params.sourceTokenShareRatio,
  });

  const targetUnderlyingShares = tokenQuantityToUnderlyingShares({
    tokenQuantity: params.targetTokenAmount,
    tokenShareRatio: params.targetTokenShareRatio,
  });

  const parityTargetTokenAmount =
    sourceUnderlyingShares !== null
      ? underlyingSharesToTokenQuantity({
          underlyingShares: sourceUnderlyingShares,
          tokenShareRatio: params.targetTokenShareRatio,
        })
      : null;

  const sourceShares = decimal(sourceUnderlyingShares);
  const targetShares = decimal(targetUnderlyingShares);

  if (
    !sourceTokenAmount ||
    sourceTokenAmount.lte(0) ||
    !targetTokenAmount ||
    targetTokenAmount.lt(0) ||
    !sourceShares ||
    sourceShares.lte(0) ||
    !targetShares ||
    parityTargetTokenAmount === null
  ) {
    return {
      status: "UNAVAILABLE",
      sourceTokenAmount:
        sourceTokenAmount && sourceTokenAmount.gte(0)
          ? transport(sourceTokenAmount)
          : null,
      sourceUnderlyingShares,
      targetTokenAmount:
        targetTokenAmount && targetTokenAmount.gte(0)
          ? transport(targetTokenAmount)
          : null,
      targetUnderlyingShares,
      parityTargetTokenAmount,
      underlyingRetentionPct: null,
      underlyingDeltaPct: null,
    };
  }

  const retention = targetShares.div(sourceShares).mul(100);
  const delta = targetShares.div(sourceShares).minus(1).mul(100);

  return {
    status: "AVAILABLE",
    sourceTokenAmount: transport(sourceTokenAmount),
    sourceUnderlyingShares,
    targetTokenAmount: transport(targetTokenAmount),
    targetUnderlyingShares,
    parityTargetTokenAmount,
    underlyingRetentionPct: transport(retention),
    underlyingDeltaPct: transport(delta),
  };
}