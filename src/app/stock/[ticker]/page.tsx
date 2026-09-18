import type { Metadata } from "next";

import { StockTerminal } from "@/components/market/StockTerminal";
import { NewsDock } from "@/components/news/NewsDock";

interface StockPageProps {
  params: Promise<{
    ticker: string;
  }>;
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
}: StockPageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = normalizedTicker(rawTicker);

  return (
    <>
      <StockTerminal ticker={ticker} />
      <NewsDock />
    </>
  );
}
