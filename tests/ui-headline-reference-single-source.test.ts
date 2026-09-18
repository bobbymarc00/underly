import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("stock headline reference semantics", () => {
  it("uses canonical single-source selection instead of resolved-field conflict", () => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/components/market/StockTerminal.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      'import { selectHeadlineReference } from "@/lib/ui/reference-selection";',
    );
    expect(source).toContain(
      "const reference = selectHeadlineReference(company?.wrappers ?? []);",
    );
    expect(source).not.toContain(
      'const reference = field(fundamentals, "referencePrice");',
    );
  });
});
