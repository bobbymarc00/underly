import { NextRequest, NextResponse } from "next/server";

import {
  buildPortfolioSnapshotComparison,
  isPortfolioComparisonSnapshot,
  PortfolioComparisonError,
} from "@/lib/underly/portfolio-comparison";

export const runtime = "nodejs";

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore(
      { version: "0.9-A", error: "INVALID_JSON_BODY" },
      400,
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("snapshotA" in body) ||
    !("snapshotB" in body) ||
    !isPortfolioComparisonSnapshot(body.snapshotA) ||
    !isPortfolioComparisonSnapshot(body.snapshotB)
  ) {
    return jsonNoStore(
      {
        version: "0.9-A",
        error: "INVALID_PORTFOLIO_SNAPSHOT_PAIR",
        provenance: "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES",
      },
      400,
    );
  }

  try {
    return jsonNoStore(
      buildPortfolioSnapshotComparison({
        snapshotA: body.snapshotA,
        snapshotB: body.snapshotB,
      }),
    );
  } catch (error) {
    if (error instanceof PortfolioComparisonError) {
      return jsonNoStore(
        {
          version: "0.9-A",
          error: error.code,
          message: error.message,
          provenance: "CLIENT_SUPPLIED_PORTFOLIO_RESPONSES",
        },
        error.code === "SNAPSHOT_INVALID" ? 400 : 422,
      );
    }
    return jsonNoStore(
      { version: "0.9-A", error: "PORTFOLIO_COMPARISON_FAILED" },
      500,
    );
  }
}
