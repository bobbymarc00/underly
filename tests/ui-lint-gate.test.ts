import { describe, expect, it } from "vitest";

import { reconcileProviderFilter } from "@/components/underly/result-view";
import { shouldClearSearchDiscovery } from "@/components/underly/search-panel";

describe("v1.0-D lint-safe UI state reconciliation", () => {
  it("keeps an active provider when it remains available", () => {
    expect(
      reconcileProviderFilter(
        { activeProvider: "provider-a", providerSignature: "provider-a" },
        ["provider-a", "provider-b"],
      ),
    ).toEqual({
      activeProvider: "provider-a",
      providerSignature: "provider-a\u0000provider-b",
    });
  });

  it("resets a removed provider to all wrappers", () => {
    expect(
      reconcileProviderFilter(
        {
          activeProvider: "provider-a",
          providerSignature: "provider-a\u0000provider-b",
        },
        ["provider-b"],
      ),
    ).toEqual({
      activeProvider: "ALL",
      providerSignature: "provider-b",
    });
  });

  it("clears discovery only for empty or exact-contract input", () => {
    expect(shouldClearSearchDiscovery("   ")).toBe(true);
    expect(
      shouldClearSearchDiscovery("0x1111111111111111111111111111111111111111"),
    ).toBe(true);
    expect(shouldClearSearchDiscovery("NVDA")).toBe(false);
  });
});
