import Decimal from "decimal.js";

import type {
  AssetGraphDeployment,
  AssetGraphUnderlying,
  GraphSessionState,
} from "./asset-graph";

const PreciseDecimal = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
});

export type DislocationEvidenceStatus = "MULTI_WRAPPER" | "SINGLE_SOURCE";

export interface DislocationItem {
  ticker: string;
  name: string;
  chainId: string;
  sessionState: GraphSessionState;
  providers: string[];
  wrapperCount: number;
  evidenceStatus: DislocationEvidenceStatus;
  maxAbsoluteGapPct: string;
  gapSpreadPctPoints: string;
  wrappers: Array<{
    provider: string;
    symbol: string;
    contractAddress: string;
    tokenShareRatio: string;
    tokenPriceUsd: string;
    referencePriceUsd: string;
    shareEquivalentPriceUsd: string;
    referenceGapPct: string;
    tradingAvailable: boolean | null;
    marketStatus: string | null;
    nextOpenAt: number | null;
  }>;
}

function transport(value: Decimal): string {
  return value.toSignificantDigits(24).toFixed();
}

function usableDeployment(
  deployment: AssetGraphDeployment,
): deployment is AssetGraphDeployment & {
  tokenShareRatio: string;
  market: AssetGraphDeployment["market"] & {
    tokenPriceUsd: string;
    referencePriceUsd: string;
    shareEquivalentPriceUsd: string;
    referenceGapPct: string;
  };
} {
  return Boolean(
    deployment.tokenShareRatio &&
      deployment.market.tokenPriceUsd &&
      deployment.market.referencePriceUsd &&
      deployment.market.shareEquivalentPriceUsd &&
      deployment.market.referenceGapPct,
  );
}

function itemFromUnderlying(
  underlying: AssetGraphUnderlying,
): DislocationItem | null {
  const deployments = underlying.deployments.filter(usableDeployment);
  if (!deployments.length) return null;

  const gaps = deployments.map(
    (deployment) => new PreciseDecimal(deployment.market.referenceGapPct),
  );
  const maxAbsoluteGap = gaps.reduce(
    (max, value) => Decimal.max(max, value.abs()),
    new PreciseDecimal(0),
  );
  const spread = Decimal.max(...gaps).minus(Decimal.min(...gaps));

  return {
    ticker: underlying.ticker,
    name: underlying.name,
    chainId: deployments[0].chainId,
    sessionState: underlying.sessionState,
    providers: Array.from(
      new Set(deployments.map((deployment) => deployment.provider)),
    ).sort(),
    wrapperCount: deployments.length,
    evidenceStatus:
      deployments.length > 1 ? "MULTI_WRAPPER" : "SINGLE_SOURCE",
    maxAbsoluteGapPct: transport(maxAbsoluteGap),
    gapSpreadPctPoints: transport(spread),
    wrappers: deployments
      .map((deployment) => ({
        provider: deployment.provider,
        symbol: deployment.symbol,
        contractAddress: deployment.contractAddress,
        tokenShareRatio: deployment.tokenShareRatio,
        tokenPriceUsd: deployment.market.tokenPriceUsd,
        referencePriceUsd: deployment.market.referencePriceUsd,
        shareEquivalentPriceUsd: deployment.market.shareEquivalentPriceUsd,
        referenceGapPct: deployment.market.referenceGapPct,
        tradingAvailable: deployment.session.tradingAvailable,
        marketStatus: deployment.session.status,
        nextOpenAt: deployment.session.nextOpenAt,
      }))
      .sort((a, b) => {
        const gapA = Math.abs(Number(a.referenceGapPct));
        const gapB = Math.abs(Number(b.referenceGapPct));
        return gapB - gapA || a.provider.localeCompare(b.provider);
      }),
  };
}

export function buildDislocationItems(params: {
  graph: AssetGraphUnderlying[];
  session?: "all" | "open" | "closed";
  limit?: number;
}): DislocationItem[] {
  const session = params.session ?? "all";
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 12);

  return params.graph
    .map(itemFromUnderlying)
    .filter((item): item is DislocationItem => item !== null)
    .filter((item) => {
      if (session === "open") return item.sessionState === "OPEN";
      if (session === "closed") return item.sessionState === "CLOSED";
      return true;
    })
    .sort((a, b) => {
      if (session === "all") {
        const priority = (state: GraphSessionState) =>
          state === "CLOSED" ? 0 : state === "MIXED" ? 1 : state === "OPEN" ? 2 : 3;
        const stateOrder = priority(a.sessionState) - priority(b.sessionState);
        if (stateOrder !== 0) return stateOrder;
      }

      return (
        Math.abs(Number(b.maxAbsoluteGapPct)) -
          Math.abs(Number(a.maxAbsoluteGapPct)) ||
        a.ticker.localeCompare(b.ticker)
      );
    })
    .slice(0, limit);
}
