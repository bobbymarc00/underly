import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listBscRwaTokensMock } = vi.hoisted(() => ({
  listBscRwaTokensMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  listBscRwaTokens: listBscRwaTokensMock,
}));

import { GET } from "@/app/api/dislocations/route";

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
    underlyingTicker: "AAPL",
    underlyingFullName: "Apple Inc.",
    platformId: "ondo",
    binanceChainId: "56",
    tokenContractAddress: "0x3333333333333333333333333333333333333333",
    tokenSymbol: "AAPLon",
    decimals: 18,
    tokenToShareRatio: "1",
    tokenPrice: "105",
    referencePrice: "100",
    statusInfo: { openState: true, marketStatus: "regular" },
  },
];

describe("/api/dislocations v0.3", () => {
  beforeEach(() => {
    listBscRwaTokensMock.mockReset();
    listBscRwaTokensMock.mockResolvedValue({
      code: 0,
      msg: "success",
      data: rows,
    });
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  it("normalizes ratio before calculating reference gap", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/dislocations?session=closed&limit=6"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].ticker).toBe("NVDA");

    const bstock = payload.items[0].wrappers.find(
      (wrapper: { provider: string }) => wrapper.provider === "bstock",
    );

    expect(bstock.shareEquivalentPriceUsd).toBe("200");
    expect(bstock.referenceGapPct).toBe("0");
    expect(payload.items[0].maxAbsoluteGapPct).toBe("2");
  });

  it("filters to closed underlying sessions when requested", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/dislocations?session=closed"),
    );
    const payload = await response.json();

    expect(payload.items.map((item: { ticker: string }) => item.ticker)).toEqual([
      "NVDA",
    ]);
  });
});
