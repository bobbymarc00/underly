import { describe, expect, it } from "vitest";

import { selectHeadlineReference } from "@/lib/ui/reference-selection";

describe("headline reference selection", () => {
  it("prefers Underlying Market over RWA Price when providers disagree", () => {
    const result = selectHeadlineReference([
      {
        provider: "bstock",
        symbol: "NVDAB",
        fundamentals: { referencePrice: "219.69" },
        fundamentalsSource: { referencePrice: "RWA_PRICE" },
      },
      {
        provider: "ondo",
        symbol: "NVDAon",
        fundamentals: { referencePrice: "219.13" },
        fundamentalsSource: { referencePrice: "UNDERLYING_MARKET" },
      },
    ]);

    expect(result).toEqual({
      value: "219.13",
      status: "SINGLE_SOURCE",
      provider: "ondo",
      symbol: "NVDAon",
      source: "UNDERLYING_MARKET",
    });
  });

  it("uses deterministic provider priority inside the same source class", () => {
    const result = selectHeadlineReference([
      {
        provider: "bstock",
        symbol: "AAA",
        fundamentals: { referencePrice: "101" },
        fundamentalsSource: { referencePrice: "UNDERLYING_MARKET" },
      },
      {
        provider: "ondo",
        symbol: "BBB",
        fundamentals: { referencePrice: "100" },
        fundamentalsSource: { referencePrice: "UNDERLYING_MARKET" },
      },
    ]);

    expect(result.value).toBe("100");
    expect(result.provider).toBe("ondo");
    expect(result.status).toBe("SINGLE_SOURCE");
  });

  it("falls back to RWA Price when no Underlying Market reference exists", () => {
    const result = selectHeadlineReference([
      {
        provider: "bstock",
        symbol: "GOOGLB",
        fundamentals: { referencePrice: "355.300146" },
        fundamentalsSource: { referencePrice: "RWA_PRICE" },
      },
      {
        provider: "other",
        symbol: "GOOGLX",
        fundamentals: { referencePrice: null },
        fundamentalsSource: { referencePrice: null },
      },
    ]);

    expect(result.value).toBe("355.300146");
    expect(result.source).toBe("RWA_PRICE");
    expect(result.status).toBe("SINGLE_SOURCE");
  });

  it("returns UNKNOWN when no valid reference exists", () => {
    const result = selectHeadlineReference([
      {
        provider: "ondo",
        symbol: "EMPTY",
        fundamentals: { referencePrice: null },
      },
      {
        provider: "bstock",
        symbol: "BAD",
        fundamentals: { referencePrice: "not-a-price" },
      },
    ]);

    expect(result).toEqual({
      value: null,
      status: "UNKNOWN",
      provider: null,
      symbol: null,
      source: null,
    });
  });
});
