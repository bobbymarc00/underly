export type NewsPublicReasonCode =
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE";

export interface PublicNewsFailure {
  reasonCode: NewsPublicReasonCode;
  publicMessage: string;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  return String(error ?? "").toLowerCase();
}

export function classifyNewsProviderFailure(
  error: unknown,
): PublicNewsFailure {
  const text = errorText(error);

  if (
    text.includes("rate limit") ||
    text.includes("requests per day") ||
    text.includes("requests per minute") ||
    text.includes("free api") ||
    text.includes("premium") ||
    text.includes("thank you for using alpha vantage")
  ) {
    return {
      reasonCode: "PROVIDER_RATE_LIMIT",
      publicMessage:
        "News provider rate limit reached. Try again later.",
    };
  }

  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("aborted")
  ) {
    return {
      reasonCode: "PROVIDER_TIMEOUT",
      publicMessage:
        "News provider timed out. Try again later.",
    };
  }

  return {
    reasonCode: "PROVIDER_UNAVAILABLE",
    publicMessage:
      "News provider temporarily unavailable. Try again later.",
  };
}
