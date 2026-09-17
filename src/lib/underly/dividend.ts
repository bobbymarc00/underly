import Decimal from "decimal.js";

export type DividendYieldConvention =
  | "PERCENTAGE_POINTS"
  | "UNIT_FRACTION"
  | "UNKNOWN";

export type DividendYieldNormalizationStatus =
  | "VERIFIED_PROVIDER_CONVENTION"
  | "UNKNOWN_PROVIDER_CONVENTION"
  | "MISSING";

export interface NormalizedDividendYield {
  rawValue: string | null;
  normalizedPercent: string | null;
  convention: DividendYieldConvention;
  normalizationStatus: DividendYieldNormalizationStatus;
}

function decimalString(value?: string | null): string | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  if (!trimmed.length) return null;

  try {
    const parsed = new Decimal(trimmed);
    if (!parsed.isFinite()) return null;
    return parsed.toSignificantDigits(24).toFixed();
  } catch {
    return null;
  }
}

export function normalizeDividendYield(
  provider: string,
  rawValue?: string | null,
): NormalizedDividendYield {
  const raw = decimalString(rawValue);

  if (raw === null) {
    return {
      rawValue: null,
      normalizedPercent: null,
      convention: "UNKNOWN",
      normalizationStatus: "MISSING",
    };
  }

  const normalizedProvider = provider.trim().toLowerCase();
  const parsed = new Decimal(raw);

  if (normalizedProvider === "ondo") {
    return {
      rawValue: raw,
      normalizedPercent: parsed
        .toSignificantDigits(24)
        .toFixed(),
      convention: "PERCENTAGE_POINTS",
      normalizationStatus: "VERIFIED_PROVIDER_CONVENTION",
    };
  }

  if (normalizedProvider === "bstock") {
    return {
      rawValue: raw,
      normalizedPercent: parsed
        .mul(100)
        .toSignificantDigits(24)
        .toFixed(),
      convention: "UNIT_FRACTION",
      normalizationStatus: "VERIFIED_PROVIDER_CONVENTION",
    };
  }

  return {
    rawValue: raw,
    normalizedPercent: null,
    convention: "UNKNOWN",
    normalizationStatus: "UNKNOWN_PROVIDER_CONVENTION",
  };
}
