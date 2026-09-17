import "server-only";

import { AlphaVantageNewsProvider } from "./alpha-vantage";
import type { NewsProvider } from "./types";

export type NewsProviderState =
  | {
      status: "CONFIGURED";
      provider: NewsProvider;
    }
  | {
      status: "NOT_CONFIGURED";
      provider: null;
      reason: string;
    };

export function getConfiguredNewsProvider(): NewsProviderState {
  const requested =
    process.env.UNDERLY_NEWS_PROVIDER?.trim().toLowerCase() ?? "";

  if (!requested || requested === "none") {
    return {
      status: "NOT_CONFIGURED",
      provider: null,
      reason:
        "UNDERLY_NEWS_PROVIDER is not configured",
    };
  }

  if (requested === "alphavantage") {
    const apiKey =
      process.env.ALPHAVANTAGE_API_KEY?.trim() ?? "";

    if (!apiKey) {
      return {
        status: "NOT_CONFIGURED",
        provider: null,
        reason:
          "ALPHAVANTAGE_API_KEY is not configured",
      };
    }

    return {
      status: "CONFIGURED",
      provider: new AlphaVantageNewsProvider(apiKey),
    };
  }

  return {
    status: "NOT_CONFIGURED",
    provider: null,
    reason: `Unsupported news provider: ${requested}`,
  };
}
