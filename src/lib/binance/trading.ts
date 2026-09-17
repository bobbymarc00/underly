import "server-only";
import { binanceSignedGet, type BinanceEnvelope } from "./client";

export interface QuoteTokenMeta {
  decimal?: number | string;
  symbol?: string;
  contractAddress?: string;
}

export interface AggregatorQuoteRoute {
  quoteId?: string;
  vendorName?: string;
  executionMode?: string;
  fromTokenAmount?: string;
  toTokenAmount?: string;
  priceImpactPercent?: string;
  tradeFee?: string;
  estimateGasFee?: string;
  fromToken?: QuoteTokenMeta;
  toToken?: QuoteTokenMeta;
}

export function getAggregatorQuote(params: {
  chainId: string;
  amountRaw: string;
  fromToken: string;
  toToken: string;
  wallet: string;
}): Promise<BinanceEnvelope<AggregatorQuoteRoute[] | null>> {
  return binanceSignedGet<AggregatorQuoteRoute[] | null>("/api/v1/dex/aggregator/quote", {
    binanceChainId: params.chainId,
    amount: params.amountRaw,
    fromTokenAddress: params.fromToken,
    toTokenAddress: params.toToken,
    userWalletAddress: params.wallet,
  });
}
