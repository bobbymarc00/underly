import Decimal from "decimal.js";

export function canonicalNumericEvidence(
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed.length) return null;

  try {
    const parsed = new Decimal(trimmed);
    if (!parsed.isFinite()) return null;

    return parsed
      .toSignificantDigits(30)
      .toFixed();
  } catch {
    return null;
  }
}
