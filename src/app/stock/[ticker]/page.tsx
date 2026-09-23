import type { Metadata } from "next";

import { StockTerminal } from "@/components/market/StockTerminal";
import { NewsDock } from "@/components/news/NewsDock";
import { ContinuityRequestSchema } from "@/lib/schemas/continuity";

interface StockPageProps {
  params: Promise<{
    ticker: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function normalizedTicker(rawTicker: string): string {
  return decodeURIComponent(rawTicker).trim().toUpperCase();
}

export async function generateMetadata({
  params,
}: StockPageProps): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = normalizedTicker(rawTicker);

  return {
    title: `${ticker} · Underly`,
    description: `Read-only tokenized-equity wrapper intelligence for ${ticker}.`,
  };
}

export default async function StockPage({
  params,
  searchParams,
}: StockPageProps) {
  const { ticker: rawTicker } = await params;
  const query = await searchParams;
  const ticker = normalizedTicker(rawTicker);
  const sourceContractAddress = Array.isArray(query.continuitySource)
    ? query.continuitySource[0]
    : query.continuitySource;
  const sourceTokenAmount = Array.isArray(query.continuityAmount)
    ? query.continuityAmount[0]
    : query.continuityAmount;
  const continuityRequest = ContinuityRequestSchema.safeParse({
    sourceContractAddress,
    sourceTokenAmount,
  });
  const continuityContext = continuityRequest.success
    ? {
        sourceContractAddress:
          continuityRequest.data.sourceContractAddress.toLowerCase(),
        sourceTokenAmount: continuityRequest.data.sourceTokenAmount,
      }
    : null;

  return (
    <>
      <StockTerminal ticker={ticker} continuityContext={continuityContext} />
      <NewsDock />
    </>
  );
}
