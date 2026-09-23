import type { PortfolioPayload } from "@/lib/ui/market-types";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const POSITIVE_DECIMAL = /^\d+(?:\.\d+)?$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isPortfolioPayload(value: unknown): value is PortfolioPayload {
  if (!record(value)) return false;
  if (
    typeof value.version !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.address !== "string" ||
    !EVM_ADDRESS.test(value.address) ||
    typeof value.chainId !== "string" ||
    !["AVAILABLE", "PARTIAL", "UNAVAILABLE", "NOT_CONFIGURED"].includes(
      String(value.status),
    ) ||
    !Array.isArray(value.positions) ||
    !Array.isArray(value.underlyingExposures) ||
    !Array.isArray(value.balanceChecks) ||
    !record(value.readOnly)
  ) {
    return false;
  }

  return (
    Array.isArray(value.readOnly.rpcMethods) &&
    Array.isArray(value.readOnly.transactionMethods) &&
    value.readOnly.transactionMethods.every(
      (method) => typeof method === "string",
    )
  );
}

export function isCurrentPortfolioResponse(
  result: PortfolioPayload | null,
  inputAddress: string,
  submittedAddress: string | null,
): result is PortfolioPayload {
  if (!result || !submittedAddress) return false;
  const current = normalizedAddress(inputAddress);
  const submitted = normalizedAddress(submittedAddress);
  return (
    EVM_ADDRESS.test(current) &&
    current === submitted &&
    normalizedAddress(result.address) === submitted
  );
}

export function portfolioValuePresentation(
  payload: PortfolioPayload,
): {
  label: string;
  value: string | null;
  note: string;
  complete: boolean;
} {
  const summary = payload.summary;
  if (!summary || summary.valuationStatus === "UNAVAILABLE") {
    return {
      label: "INDICATIVE PORTFOLIO VALUE",
      value: null,
      note: "Valuation evidence is unavailable.",
      complete: false,
    };
  }
  if (
    summary.valuationStatus === "AVAILABLE" &&
    summary.indicativeValueUsd !== null
  ) {
    return {
      label: "INDICATIVE PORTFOLIO VALUE",
      value: summary.indicativeValueUsd,
      note: "All detected positive positions have current valuation evidence.",
      complete: true,
    };
  }
  return {
    label: "KNOWN INDICATIVE VALUE",
    value:
      summary.knownIndicativeValueUsd === "0"
        ? null
        : summary.knownIndicativeValueUsd,
    note:
      summary.knownIndicativeValueUsd === "0"
        ? "Partial only — no positive position has complete valuation evidence."
        : "Partial only — positions without valuation evidence are excluded.",
    complete: false,
  };
}

export function buildContinuityHref(params: {
  ticker: string | null;
  contractAddress: string;
  tokenQuantity: string | null;
  identityStatus: string;
}): string | null {
  const ticker = params.ticker?.trim().toUpperCase() ?? "";
  const contract = params.contractAddress.trim().toLowerCase();
  const quantity = params.tokenQuantity?.trim() ?? "";
  if (
    !/^[A-Z0-9.-]{1,24}$/.test(ticker) ||
    !EVM_ADDRESS.test(contract) ||
    params.identityStatus !== "AVAILABLE" ||
    !POSITIVE_DECIMAL.test(quantity) ||
    /^0+(?:\.0+)?$/.test(quantity)
  ) {
    return null;
  }

  const query = new URLSearchParams({
    continuitySource: contract,
    continuityAmount: quantity,
  });
  return `/stock/${encodeURIComponent(ticker)}?${query.toString()}`;
}
