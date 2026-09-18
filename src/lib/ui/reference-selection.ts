export type HeadlineReferenceSource =
  | "UNDERLYING_MARKET"
  | "RWA_PRICE"
  | null;

export interface HeadlineReferenceWrapper {
  provider: string;
  symbol?: string;
  fundamentals: Record<string, string | null>;
  fundamentalsSource?: {
    referencePrice?: HeadlineReferenceSource;
  };
}

export interface HeadlineReferenceSelection {
  value: string | null;
  status: "SINGLE_SOURCE" | "UNKNOWN";
  provider: string | null;
  symbol: string | null;
  source: HeadlineReferenceSource;
}

function sourceRank(source: HeadlineReferenceSource | undefined): number {
  if (source === "UNDERLYING_MARKET") return 0;
  if (source === "RWA_PRICE") return 1;
  return 2;
}

function providerRank(provider: string): number {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "ondo") return 0;
  if (normalized === "bstock" || normalized === "bstocks") return 1;
  return 2;
}

function validReference(value: string | null): value is string {
  if (value === null || value.trim() === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export function selectHeadlineReference(
  wrappers: HeadlineReferenceWrapper[],
): HeadlineReferenceSelection {
  const candidates = wrappers
    .filter((wrapper) => validReference(wrapper.fundamentals.referencePrice))
    .map((wrapper) => ({
      provider: wrapper.provider,
      symbol: wrapper.symbol ?? null,
      value: wrapper.fundamentals.referencePrice as string,
      source: wrapper.fundamentalsSource?.referencePrice ?? null,
    }))
    .sort((a, b) => {
      const bySource = sourceRank(a.source) - sourceRank(b.source);
      if (bySource !== 0) return bySource;

      const byProvider =
        providerRank(a.provider) - providerRank(b.provider);
      if (byProvider !== 0) return byProvider;

      const byProviderName = a.provider.localeCompare(b.provider);
      if (byProviderName !== 0) return byProviderName;

      return (a.symbol ?? "").localeCompare(b.symbol ?? "");
    });

  const chosen = candidates[0];

  if (!chosen) {
    return {
      value: null,
      status: "UNKNOWN",
      provider: null,
      symbol: null,
      source: null,
    };
  }

  return {
    value: chosen.value,
    status: "SINGLE_SOURCE",
    provider: chosen.provider,
    symbol: chosen.symbol,
    source: chosen.source,
  };
}
