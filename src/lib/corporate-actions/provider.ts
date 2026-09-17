import "server-only";

import { AlphaVantageCorporateActionHistoryProvider } from "./alpha-vantage";
import type { HistoricalCorporateActionProvider } from "./types";

export type ConfiguredCorporateActionHistoryProvider =
  | {
      status: "CONFIGURED";
      provider: HistoricalCorporateActionProvider;
    }
  | {
      status: "NOT_CONFIGURED";
      reason: string;
    };

export function getConfiguredCorporateActionHistoryProvider(): ConfiguredCorporateActionHistoryProvider {
  const apiKey = process.env.ALPHAVANTAGE_API_KEY?.trim();

  if (!apiKey) {
    return {
      status: "NOT_CONFIGURED",
      reason:
        "ALPHAVANTAGE_API_KEY is not configured. Historical dividend/split events are not inferred from Binance current-status fields.",
    };
  }

  return {
    status: "CONFIGURED",
    provider: new AlphaVantageCorporateActionHistoryProvider(apiKey),
  };
}
