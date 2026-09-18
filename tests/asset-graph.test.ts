import { describe, expect, it } from "vitest";

import { buildBscAssetGraph } from "@/lib/underly/asset-graph";

const rows = [
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "bstock",
    binanceChainId: "56",
    tokenContractAddress: "0x1111111111111111111111111111111111111111",
    tokenSymbol: "NVDAB",
    decimals: 18,
    tokenToShareRatio: "1.01",
    tokenPrice: "202",
    referencePrice: "200",
    statusInfo: { openState: false, marketStatus: "closed" },
  },
  {
    underlyingTicker: "NVDA",
    underlyingFullName: "NVIDIA Corporation",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress: "0x2222222222222222222222222222222222222222",
    tokenSymbol: "NVDAon",
    decimals: 18,
    tokenToShareRatio: "1",
    tokenPrice: "204",
    referencePrice: "200",
    statusInfo: { openState: false, marketStatus: "closed" },
  },
  {
    underlyingTicker: "NVDA",
    platformId: "duplicate",
    binanceChainId: "56",
    tokenContractAddress: "0x1111111111111111111111111111111111111111",
    tokenSymbol: "DUP",
  },
  {
    underlyingTicker: "NVDA",
    platformId: "other-chain",
    binanceChainId: "1",
    tokenContractAddress: "0x3333333333333333333333333333333333333333",
    tokenSymbol: "NVDAETH",
  },
];

describe("BSC asset graph", () => {
  it("groups provider deployments under one economic underlying", () => {
    const graph = buildBscAssetGraph(rows, "56");

    expect(graph).toHaveLength(1);
    expect(graph[0]).toMatchObject({
      ticker: "NVDA",
      deploymentCount: 2,
      providerCount: 2,
      providers: ["bstock", "ondo"],
      sessionState: "CLOSED",
    });
  });

  it("stores ratio-adjusted share-equivalent price per deployment", () => {
    const graph = buildBscAssetGraph(rows, "56");
    const bstock = graph[0].deployments.find(
      (deployment) => deployment.provider === "bstock",
    );
    const ondo = graph[0].deployments.find(
      (deployment) => deployment.provider === "ondo",
    );

    expect(bstock?.market.shareEquivalentPriceUsd).toBe("200");
    expect(bstock?.market.referenceGapPct).toBe("0");
    expect(ondo?.market.shareEquivalentPriceUsd).toBe("204");
    expect(ondo?.market.referenceGapPct).toBe("2");
  });
});
