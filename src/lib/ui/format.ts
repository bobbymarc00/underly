const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

const number = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
});

export function formatUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? usd.format(parsed) : String(value);
}

export function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? number.format(parsed) : String(value);
}

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(Math.abs(parsed) < 1 ? 3 : 2)}%` : `${value}%`;
}

export function compactAddress(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function formatTimestamp(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function providerLabel(provider: string): string {
  if (!provider) return "Unknown provider";
  if (provider.toLowerCase() === "ondo") return "Ondo";
  if (provider.toLowerCase() === "bstock") return "bStocks";
  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function methodologyLabel(value: string): string {
  switch (value) {
    case "CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE":
      return "Entry + reverse liquidity probe";
    case "CURRENT_DIRECT_EXIT_QUOTE":
      return "Direct exit quote";
    case "CURRENT_LIQUIDATION_VALUE":
      return "Liquidation value";
    case "NOT_APPLICABLE":
      return "No execution probe";
    default:
      return value.replaceAll("_", " ").toLowerCase();
  }
}
