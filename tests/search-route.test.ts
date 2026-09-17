import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { searchRwaMock } = vi.hoisted(() => ({
  searchRwaMock: vi.fn(),
}));

vi.mock("@/lib/binance/rwa", () => ({
  searchRwa: searchRwaMock,
}));

import { GET } from "@/app/api/search/route";

describe("/api/search contract", () => {
  beforeEach(() => {
    searchRwaMock.mockReset();
    vi.stubEnv("UNDERLY_CHAIN_ID", "56");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires q", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/search"),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "q is required",
    });

    expect(searchRwaMock).not.toHaveBeenCalled();
  });

  it("returns the stable search shape and filters wrappers to the configured chain", async () => {
    searchRwaMock.mockResolvedValueOnce({
      code: 0,
      msg: "success",
      data: [
        {
          ticker: "NVDA",
          companyName: "Nvidia Corp",
          assets: [
            {
              platformId: "ondo",
              binanceChainId: "56",
              tokenContractAddress:
                "0xa9ee28c80f960b889dfbd1902055218cba016f75",
              tokenSymbol: "NVDAon",
            },
            {
              platformId: "bstock",
              binanceChainId: "56",
              tokenContractAddress:
                "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
              tokenSymbol: "NVDAB",
            },
            {
              platformId: "other",
              binanceChainId: "1",
              tokenContractAddress:
                "0x1111111111111111111111111111111111111111",
              tokenSymbol: "NVDAETH",
            },
          ],
        },
      ],
    });

    const response = await GET(
      new NextRequest("http://localhost/api/search?q=NVDA"),
    );

    expect(response.status).toBe(200);

    const payload = await response.json();

    expect(payload).toEqual({
      data: [
        {
          ticker: "NVDA",
          companyName: "Nvidia Corp",
          wrappers: [
            {
              platform: "ondo",
              symbol: "NVDAon",
              contractAddress:
                "0xa9ee28c80f960b889dfbd1902055218cba016f75",
              chainId: "56",
            },
            {
              platform: "bstock",
              symbol: "NVDAB",
              contractAddress:
                "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
              chainId: "56",
            },
          ],
        },
      ],
    });

    expect(searchRwaMock).toHaveBeenCalledWith("NVDA");
  });

  it("maps Binance business errors to 502", async () => {
    searchRwaMock.mockResolvedValueOnce({
      code: 40304,
      msg: "Service not available due to compliance restriction",
      data: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/search?q=NVDA"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Service not available due to compliance restriction",
      upstreamCode: 40304,
    });
  });

  it("maps thrown upstream failures to 502", async () => {
    searchRwaMock.mockRejectedValueOnce(
      new Error("upstream unavailable"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/search?q=NVDA"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "upstream unavailable",
    });
  });
});
