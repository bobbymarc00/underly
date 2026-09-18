import type { RwaTokenListRow } from "@/lib/binance/rwa";

import { buildCurrentEconomicSnapshot } from "./equivalence";

export type GraphSessionState = "OPEN" | "CLOSED" | "MIXED" | "UNKNOWN";

export interface AssetGraphDeployment {
  provider: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | string | null;
  tokenShareRatio: string | null;
  market: {
    tokenPriceUsd: string | null;
    referencePriceUsd: string | null;
    shareEquivalentPriceUsd: string | null;
    referenceGapPct: string | null;
    reportedVolume24H: string | null;
  };
  session: {
    tradingAvailable: boolean | null;
    status: string | null;
    reasonCode: string | null;
    reasonMessage: string | null;
    nextOpenAt: number | null;
    nextCloseAt: number | null;
  };
}

export interface AssetGraphUnderlying {
  ticker: string;
  name: string;
  assetType: "TOKENIZED_EQUITY";
  deploymentCount: number;
  providerCount: number;
  providers: string[];
  sessionState: GraphSessionState;
  deployments: AssetGraphDeployment[];
}

function normalizedTicker(asset: RwaTokenListRow): string {
  return (asset.underlyingTicker ?? asset.tokenSymbol).trim().toUpperCase();
}

function normalizedName(asset: RwaTokenListRow, ticker: string): string {
  return (
    asset.underlyingFullName ??
    asset.underlyingName ??
    asset.companyName ??
    ticker
  ).trim();
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function sessionState(deployments: AssetGraphDeployment[]): GraphSessionState {
  const values = deployments
    .map((deployment) => deployment.session.tradingAvailable)
    .filter((value): value is boolean => value !== null);

  if (!values.length) return "UNKNOWN";

  const open = values.some(Boolean);
  const closed = values.some((value) => !value);

  if (open && closed) return "MIXED";
  return open ? "OPEN" : "CLOSED";
}

export function buildBscAssetGraph(
  rows: RwaTokenListRow[],
  chainId: string,
): AssetGraphUnderlying[] {
  const grouped = new Map<string, RwaTokenListRow[]>();
  const seenContracts = new Set<string>();

  for (const asset of rows) {
    if (String(asset.binanceChainId) !== chainId) continue;

    const contractKey = asset.tokenContractAddress.toLowerCase();
    if (seenContracts.has(contractKey)) continue;
    seenContracts.add(contractKey);

    const ticker = normalizedTicker(asset);
    const current = grouped.get(ticker) ?? [];
    current.push(asset);
    grouped.set(ticker, current);
  }

  return Array.from(grouped.entries())
    .map(([ticker, assets]) => {
      const deployments: AssetGraphDeployment[] = assets
        .map((asset) => {
          const economic = buildCurrentEconomicSnapshot({
            tokenPriceUsd: asset.tokenPrice,
            referencePriceUsd: asset.referencePrice,
            tokenShareRatio: asset.tokenToShareRatio,
          });

          return {
            provider: asset.platformId?.trim() || "unknown",
            symbol: asset.tokenSymbol,
            contractAddress: asset.tokenContractAddress,
            chainId: String(asset.binanceChainId),
            decimals: asset.decimals ?? null,
            tokenShareRatio: economic.tokenShareRatio,
            market: {
              tokenPriceUsd: economic.tokenPriceUsd,
              referencePriceUsd: economic.referencePriceUsd,
              shareEquivalentPriceUsd: economic.shareEquivalentPriceUsd,
              referenceGapPct: economic.referenceGapPct,
              reportedVolume24H: scalar(asset.volume24H),
            },
            session: {
              tradingAvailable: asset.statusInfo?.openState ?? null,
              status: asset.statusInfo?.marketStatus ?? null,
              reasonCode: asset.statusInfo?.reasonCode ?? null,
              reasonMessage: asset.statusInfo?.reasonMsg ?? null,
              nextOpenAt: asset.statusInfo?.nextOpenTime ?? null,
              nextCloseAt: asset.statusInfo?.nextCloseTime ?? null,
            },
          };
        })
        .sort(
          (a, b) =>
            a.provider.localeCompare(b.provider) ||
            a.symbol.localeCompare(b.symbol),
        );

      const providers = Array.from(
        new Set(deployments.map((deployment) => deployment.provider)),
      ).sort();

      return {
        ticker,
        name: normalizedName(assets[0], ticker),
        assetType: "TOKENIZED_EQUITY" as const,
        deploymentCount: deployments.length,
        providerCount: providers.length,
        providers,
        sessionState: sessionState(deployments),
        deployments,
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}
