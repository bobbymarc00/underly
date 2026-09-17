import Decimal from "decimal.js";

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

export function buildValuation(params: {
  displayedValueUsd: string;
  tokenPriceUsd?: string;
  referencePriceUsd?: string;
  executableValueUsd?: string | null;
}) {
  const displayed = new PreciseDecimal(params.displayedValueUsd);
  let referenceAdjusted: Decimal | null = null;

  if (params.tokenPriceUsd && params.referencePriceUsd) {
    const token = new PreciseDecimal(params.tokenPriceUsd);
    const ref = new PreciseDecimal(params.referencePriceUsd);
    if (!token.isZero()) referenceAdjusted = displayed.mul(ref).div(token);
  }

  const executable = params.executableValueUsd
    ? new PreciseDecimal(params.executableValueUsd)
    : null;

  const candidates = [displayed, referenceAdjusted, executable].filter(
    (value): value is Decimal => value !== null,
  );
  const conservative = PreciseDecimal.min(...candidates);

  const basis = [
    referenceAdjusted ? "REFERENCE" : null,
    executable ? "EXECUTABLE_VALUE" : null,
    "DISPLAYED_VALUE",
  ].filter(Boolean);

  return {
    displayedValueUsd: displayed.toSignificantDigits(24).toFixed(),
    referenceAdjustedValueUsd: referenceAdjusted?.toSignificantDigits(24).toFixed() ?? null,
    executableValueUsd: executable?.toSignificantDigits(24).toFixed() ?? null,
    conservativeValueUsd: conservative.toSignificantDigits(24).toFixed(),
    basis,
  };
}
