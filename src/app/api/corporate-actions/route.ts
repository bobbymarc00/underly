import { NextRequest, NextResponse } from "next/server";

import {
  getUnderlyingMarket,
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import { buildCorporateActionSignal } from "@/lib/underly/actions";
import { normalizeDividendYield } from "@/lib/underly/dividend";

export const runtime = "nodejs";

type SourceState = "AVAILABLE" | "UNAVAILABLE";
type OverallState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type ResolutionState =
  | "CONSENSUS"
  | "SINGLE_SOURCE"
  | "CONFLICT"
  | "UNKNOWN";

interface EvidenceValue {
  provider: string;
  symbol: string;
  value: string;
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function dedupeAssets(
  assets: RwaTokenListRow[],
): RwaTokenListRow[] {
  const seen = new Set<string>();
  const result: RwaTokenListRow[] = [];

  for (const asset of assets) {
    const key = asset.tokenContractAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
}

function resolveEvidence(
  evidence: EvidenceValue[],
): {
  value: string | null;
  status: ResolutionState;
  evidence: EvidenceValue[];
} {
  if (!evidence.length) {
    return {
      value: null,
      status: "UNKNOWN",
      evidence: [],
    };
  }

  const distinct = Array.from(
    new Set(evidence.map((item) => item.value)),
  );

  if (distinct.length > 1) {
    return {
      value: null,
      status: "CONFLICT",
      evidence,
    };
  }

  return {
    value: distinct[0],
    status:
      evidence.length === 1
        ? "SINGLE_SOURCE"
        : "CONSENSUS",
    evidence,
  };
}

function overallState(
  states: SourceState[],
): OverallState {
  if (states.every((state) => state === "AVAILABLE")) {
    return "AVAILABLE";
  }
  if (states.every((state) => state === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  return "PARTIAL";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker =
    url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker is required" },
      { status: 400 },
    );
  }

  if (ticker.length > 20) {
    return NextResponse.json(
      { error: "ticker is too long" },
      { status: 400 },
    );
  }

  const chainId = process.env.UNDERLY_CHAIN_ID || "56";

  try {
    const universe = await listBscRwaTokens(chainId);

    if (universe.code !== 0) {
      return NextResponse.json(
        {
          error: universe.msg,
          upstreamCode: universe.code,
        },
        { status: 502 },
      );
    }

    const assets = dedupeAssets(
      (universe.data ?? []).filter(
        (asset) =>
          String(asset.binanceChainId) === chainId &&
          (asset.underlyingTicker ?? "")
            .trim()
            .toUpperCase() === ticker,
      ),
    );

    if (!assets.length) {
      return NextResponse.json(
        { error: `No RWA wrappers found for ${ticker}` },
        { status: 404 },
      );
    }

    const observedAt = new Date().toISOString();

    const wrappers = await Promise.all(
      assets.map(async (asset) => {
        const provider =
          asset.platformId?.trim() || "unknown";

        try {
          const envelope = await getUnderlyingMarket(
            chainId,
            asset.tokenContractAddress,
          );

          if (envelope.code !== 0) {
            return {
              provider,
              symbol: asset.tokenSymbol,
              contractAddress: asset.tokenContractAddress,
              sourceState: "UNAVAILABLE" as const,
              marketSession: null,
              actionGuard: null,
              dividend: {
                latestDividend: null,
                dividendYield: null,
                dividendYieldNormalized:
                  normalizeDividendYield(provider, null),
              },
              currentEvents: [],
              source: {
                endpoint: "RWA Underlying Market Data",
                upstreamCode: envelope.code,
                upstreamMessage: envelope.msg,
              },
            };
          }

          const market = envelope.data ?? {};
          const statusInfo = market.statusInfo ?? null;
          const marketData = market.marketData ?? {};
          const rawDividendYield =
            scalar(marketData.dividendYield);

          const actionGuard = buildCorporateActionSignal({
            statusInfoAvailable: statusInfo !== null,
            tradingAvailable:
              statusInfo?.openState ?? null,
            marketStatus:
              statusInfo?.marketStatus ?? null,
            reasonCode:
              statusInfo?.reasonCode ?? null,
            reasonMessage:
              statusInfo?.reasonMsg ?? null,
          });

          const currentEvents = actionGuard.events.map(
            (event) => ({
              ...event,
              observedAt,
              temporalSemantics: "CURRENT_STATUS_ONLY",
            }),
          );

          return {
            provider,
            symbol: asset.tokenSymbol,
            contractAddress: asset.tokenContractAddress,
            sourceState: "AVAILABLE" as const,
            marketSession: {
              tradingAvailable:
                statusInfo?.openState ?? null,
              status:
                statusInfo?.marketStatus ?? null,
              reasonCode:
                statusInfo?.reasonCode ?? null,
              reasonMessage:
                statusInfo?.reasonMsg ?? null,
              nextOpenAt:
                statusInfo?.nextOpenTime ?? null,
              nextCloseAt:
                statusInfo?.nextCloseTime ?? null,
            },
            actionGuard,
            dividend: {
              latestDividend:
                scalar(marketData.latestDividend),
              dividendYield: rawDividendYield,
              dividendYieldNormalized:
                normalizeDividendYield(
                  provider,
                  rawDividendYield,
                ),
            },
            currentEvents,
            source: {
              endpoint: "RWA Underlying Market Data",
              upstreamCode: envelope.code,
              upstreamMessage: envelope.msg,
            },
          };
        } catch (error) {
          return {
            provider,
            symbol: asset.tokenSymbol,
            contractAddress: asset.tokenContractAddress,
            sourceState: "UNAVAILABLE" as const,
            marketSession: null,
            actionGuard: null,
            dividend: {
              latestDividend: null,
              dividendYield: null,
              dividendYieldNormalized:
                normalizeDividendYield(provider, null),
            },
            currentEvents: [],
            source: {
              endpoint: "RWA Underlying Market Data",
              upstreamCode: null,
              upstreamMessage:
                error instanceof Error
                  ? error.message
                  : "Underlying market request failed",
            },
          };
        }
      }),
    );

    wrappers.sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.symbol.localeCompare(b.symbol),
    );

    const state = overallState(
      wrappers.map((wrapper) => wrapper.sourceState),
    );

    const latestDividend = resolveEvidence(
      wrappers.flatMap((wrapper) =>
        wrapper.dividend.latestDividend
          ? [{
              provider: wrapper.provider,
              symbol: wrapper.symbol,
              value: wrapper.dividend.latestDividend,
            }]
          : [],
      ),
    );

    const dividendYield = resolveEvidence(
      wrappers.flatMap((wrapper) =>
        wrapper.dividend.dividendYield
          ? [{
              provider: wrapper.provider,
              symbol: wrapper.symbol,
              value: wrapper.dividend.dividendYield,
            }]
          : [],
      ),
    );

    const dividendYieldPercent = resolveEvidence(
      wrappers.flatMap((wrapper) => {
        const normalized =
          wrapper.dividend.dividendYieldNormalized;

        return normalized.normalizedPercent !== null
          ? [{
              provider: wrapper.provider,
              symbol: wrapper.symbol,
              value: normalized.normalizedPercent,
            }]
          : [];
      }),
    );

    const availableActionStatuses = wrappers.flatMap(
      (wrapper) =>
        wrapper.actionGuard
          ? [wrapper.actionGuard.status]
          : [],
    );
    const distinctActionStatuses = Array.from(
      new Set(availableActionStatuses),
    );

    const actionStatusAgreement:
      | "CONSENSUS"
      | "CONFLICT"
      | "UNKNOWN" =
      availableActionStatuses.length === 0
        ? "UNKNOWN"
        : distinctActionStatuses.length === 1
          ? "CONSENSUS"
          : "CONFLICT";

    const responseBody = {
      version: "0.2",
      generatedAt: observedAt,
      ticker,
      chainId,
      state,
      currentStatus: {
        agreement: actionStatusAgreement,
        status:
          actionStatusAgreement === "CONSENSUS"
            ? distinctActionStatuses[0]
            : null,
        wrapperStatuses: wrappers.map((wrapper) => ({
          provider: wrapper.provider,
          symbol: wrapper.symbol,
          status:
            wrapper.actionGuard?.status ?? "UNKNOWN",
        })),
      },
      dividendSnapshot: {
        latestDividend,
        dividendYield,
        dividendYieldPercent,
        normalization: {
          status:
            "VERIFIED_FOR_CURRENT_ONDO_BSTOCK_PROVIDER_CONVENTIONS",
          unit: "PERCENTAGE_POINTS",
          note:
            "Live overlap diagnostics on 2026-09-17 showed Ondo reports dividend yield in percentage points while bStocks reports a unit fraction. Raw values remain preserved per wrapper; unknown future providers are not normalized until verified.",
        },
        temporalSemantics:
          "CURRENT_UNDERLYING_MARKET_SNAPSHOT",
      },
      currentEvents: wrappers.flatMap((wrapper) =>
        wrapper.currentEvents.map((event) => ({
          provider: wrapper.provider,
          symbol: wrapper.symbol,
          ...event,
        })),
      ),
      history: {
        status: "SEPARATE_ENDPOINT",
        endpoint:
          `/api/corporate-actions/history?ticker=${encodeURIComponent(ticker)}`,
        events: [],
        note:
          "Historical dividend and stock-split evidence is intentionally served by a separate endpoint and does not modify current Binance ActionGuard semantics.",
      },
      wrappers,
      methodology: {
        actionGuard:
          "Current wrapper status evidence is classified by the existing deterministic ActionGuard logic. Ordinary session restrictions are not treated as corporate actions.",
        dividend:
          "Raw dividend yield remains preserved. Verified provider conventions are additionally normalized to percentage points without modifying raw evidence.",
        history:
          "Historical dividend and split events are exposed only through the dedicated provider-backed history endpoint. They are not merged into current ActionGuard evidence, and no event is manufactured from current status or latestDividend fields.",
      },
    };

    if (state === "UNAVAILABLE") {
      return NextResponse.json(
        {
          ...responseBody,
          error:
            "Corporate-action and dividend snapshot unavailable for all wrappers",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Corporate-action request failed",
      },
      { status: 502 },
    );
  }
}
