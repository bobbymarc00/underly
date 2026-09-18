import { describe, expect, it } from "vitest";

import {
  canonicalNumericEvidence,
} from "@/lib/underly/evidence";

describe("numeric evidence equivalence", () => {
  it("treats formatting-only decimal differences as equal", () => {
    expect(canonicalNumericEvidence("779.3700")).toBe(
      canonicalNumericEvidence("779.37"),
    );
    expect(canonicalNumericEvidence("0.250000")).toBe(
      canonicalNumericEvidence("0.25"),
    );
  });

  it("keeps genuinely different values distinct", () => {
    expect(canonicalNumericEvidence("27.4600")).not.toBe(
      canonicalNumericEvidence("26.78"),
    );
    expect(canonicalNumericEvidence("5300000000000")).not.toBe(
      canonicalNumericEvidence("5290000000000"),
    );
  });

  it("does not invent numeric meaning for non-numeric values", () => {
    expect(canonicalNumericEvidence("Technology")).toBeNull();
  });
});
