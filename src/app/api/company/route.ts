import { NextRequest, NextResponse } from "next/server";

import {
  getUnderlyingMarket,
  getUnderlyingProfile,
  listBscRwaTokens,
  type RwaCompanyInfo,
  type RwaTokenListRow,
  type RwaUnderlyingMarketFields,
} from "@/lib/binance/rwa";

export const runtime = "nodejs";

type SourceState = "AVAILABLE" | "UNAVAILABLE";
type WrapperState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type OverallState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type ResolutionState = "CONSENSUS" | "SINGLE_SOURCE" | "CONFLICT" | "UNKNOWN";

interface FieldEvidence {
  provider: string;
  symbol: string;
  value: string;
}

interface ResolvedField {
  value: string | null;
  status: ResolutionState;
  evidence: FieldEvidence[];
}

const PROFILE_FIELDS = [
  "ceo",
  "website",
  "industry",
  "descriptionEn",
] as const;

const FUNDAMENTAL_FIELDS = [
  "referencePrice",
  "high52W",
  "low52W",
  "volumeShares24H",
  "avgDailyVolume1Y",
  "totalShares",
  "marketCap",
  "turnoverRate",
  "amplitude",
  "peRatioTTM",
  "pbRatio",
  "dividendYield",
  "latestDividend",
] as const;

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

function dedupeAssets(assets: RwaTokenListRow[]): RwaTokenListRow[] {
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

function resolveField(evidence: FieldEvidence[]): ResolvedField {
  if (!evidence.length) {
    return {
      value: null,
      status: "UNKNOWN",
      evidence: [],
    };
  }

  const distinct = Array.from(new Set(evidence.map((item) => item.value)));

  if (distinct.length > 1) {
    return {
      value: null,
      status: "CONFLICT",
      evidence,
    };
  }

  return {
    value: distinct[0],
    status: evidence.length === 1 ? "SINGLE_SOURCE" : "CONSENSUS",
    evidence,
  };
}

function wrapperState(
  profileState: SourceState,
  marketState: SourceState,
): WrapperState {
  if (profileState === "AVAILABLE" && marketState === "AVAILABLE") {
    return "AVAILABLE";
  }
  if (profileState === "UNAVAILABLE" && marketState === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  return "PARTIAL";
}

function overallState(states: WrapperState[]): OverallState {
  if (states.every((state) => state === "UNAVAILABLE")) return "UNAVAILABLE";
  if (states.every((state) => state === "AVAILABLE")) return "AVAILABLE";
  return "PARTIAL";
}

function assetName(asset: RwaTokenListRow, ticker: string): string {
  return (
    asset.underlyingFullName ??
    asset.underlyingName ??
    asset.companyName ??
    ticker
  ).trim();
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.trim().toUpperCase() ?? "";

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
          (asset.underlyingTicker ?? "").trim().toUpperCase() === ticker,
      ),
    );

    if (!assets.length) {
      return NextResponse.json(
        { error: `No RWA wrappers found for ${ticker}` },
        { status: 404 },
      );
    }

    const wrappers = await Promise.all(
      assets.map(async (asset) => {
        const [profileResult, marketResult] = await Promise.allSettled([
          getUnderlyingProfile(chainId, asset.tokenContractAddress),
          getUnderlyingMarket(chainId, asset.tokenContractAddress),
        ]);

        const profileEnvelope =
          profileResult.status === "fulfilled" ? profileResult.value : null;
        const marketEnvelope =
          marketResult.status === "fulfilled" ? marketResult.value : null;

        const profileAvailable = profileEnvelope?.code === 0;
        const marketAvailable = marketEnvelope?.code === 0;

        const profileState: SourceState = profileAvailable
          ? "AVAILABLE"
          : "UNAVAILABLE";
        const marketState: SourceState = marketAvailable
          ? "AVAILABLE"
          : "UNAVAILABLE";

        const profile = profileAvailable ? profileEnvelope?.data ?? {} : {};
        const market = marketAvailable ? marketEnvelope?.data ?? {} : {};
        const companyInfo: RwaCompanyInfo = profile.companyInfo ?? {};
        const fundamentals: RwaUnderlyingMarketFields =
          market.marketData ?? {};

        return {
          provider: asset.platformId?.trim() || "unknown",
          symbol: asset.tokenSymbol,
          contractAddress: asset.tokenContractAddress,
          tokenShareRatio: asset.tokenToShareRatio ?? profile.tokenToShareRatio ?? null,
          state: wrapperState(profileState, marketState),
          sourceState: {
            profile: profileState,
            market: marketState,
          },
          company: {
            name:
              profile.underlyingFullName ??
              assetName(asset, ticker),
            ceo: scalar(companyInfo.ceo),
            website: scalar(companyInfo.website),
            industry: scalar(companyInfo.industry),
            description: scalar(companyInfo.descriptionEn),
            concepts: Array.isArray(companyInfo.conceptsEn)
              ? companyInfo.conceptsEn.filter(
                  (value): value is string =>
                    typeof value === "string" && value.trim().length > 0,
                )
              : [],
          },
          fundamentals: Object.fromEntries(
            FUNDAMENTAL_FIELDS.map((field) => [
              field,
              scalar(fundamentals[field]),
            ]),
          ) as Record<(typeof FUNDAMENTAL_FIELDS)[number], string | null>,
          marketSession: {
            tradingAvailable: market.statusInfo?.openState ?? null,
            status: market.statusInfo?.marketStatus ?? null,
            reasonCode: market.statusInfo?.reasonCode ?? null,
            reasonMessage: market.statusInfo?.reasonMsg ?? null,
            nextOpenAt: market.statusInfo?.nextOpenTime ?? null,
            nextCloseAt: market.statusInfo?.nextCloseTime ?? null,
          },
          sources: {
            profile: {
              endpoint: "RWA Underlying Info",
              state: profileState,
              upstreamCode:
                profileEnvelope?.code ??
                null,
              upstreamMessage:
                profileEnvelope?.msg ??
                (profileResult.status === "rejected"
                  ? String(profileResult.reason)
                  : null),
            },
            market: {
              endpoint: "RWA Underlying Market Data",
              state: marketState,
              upstreamCode:
                marketEnvelope?.code ??
                null,
              upstreamMessage:
                marketEnvelope?.msg ??
                (marketResult.status === "rejected"
                  ? String(marketResult.reason)
                  : null),
            },
          },
        };
      }),
    );

    wrappers.sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.symbol.localeCompare(b.symbol),
    );

    const profileResolution = Object.fromEntries(
      PROFILE_FIELDS.map((field) => {
        const evidence = wrappers.flatMap((wrapper) => {
          const key =
            field === "descriptionEn"
              ? "description"
              : field;
          const value = scalar(
            wrapper.company[key as keyof typeof wrapper.company],
          );

          return value
            ? [
                {
                  provider: wrapper.provider,
                  symbol: wrapper.symbol,
                  value,
                },
              ]
            : [];
        });

        const outputKey =
          field === "descriptionEn" ? "description" : field;

        return [outputKey, resolveField(evidence)];
      }),
    );

    const fundamentalsResolution = Object.fromEntries(
      FUNDAMENTAL_FIELDS.map((field) => {
        const evidence = wrappers.flatMap((wrapper) => {
          const value = wrapper.fundamentals[field];
          return value
            ? [
                {
                  provider: wrapper.provider,
                  symbol: wrapper.symbol,
                  value,
                },
              ]
            : [];
        });

        return [field, resolveField(evidence)];
      }),
    );

    const state = overallState(wrappers.map((wrapper) => wrapper.state));
    const responseBody = {
      version: "0.2",
      generatedAt: new Date().toISOString(),
      ticker,
      chainId,
      state,
      company: {
        name: assetName(assets[0], ticker),
        fields: profileResolution,
      },
      fundamentals: {
        fields: fundamentalsResolution,
      },
      wrappers,
      methodology: {
        fieldResolution:
          "A field is CONSENSUS when every available non-null wrapper source agrees, SINGLE_SOURCE when only one wrapper supplies it, CONFLICT when non-null wrapper values disagree, and UNKNOWN when no wrapper supplies it. CONFLICT is never silently collapsed to one provider.",
        fundamentals:
          "Underlying fundamentals are preserved per wrapper and also resolved across wrapper sources without choosing a winner when values disagree.",
      },
    };

    if (state === "UNAVAILABLE") {
      return NextResponse.json(
        {
          ...responseBody,
          error: "Company profile and fundamentals unavailable for all wrappers",
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
            : "Company profile request failed",
      },
      { status: 502 },
    );
  }
}
