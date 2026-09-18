import "server-only";

import {
  binanceSignedGet,
  type BinanceEnvelope,
} from "./client";
import type {
  AggregatorQuoteRoute,
} from "./trading";

export interface AggregatorSwapTransaction {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxPriorityFeePerGas?: string;
  minReceiveAmount?: string;
  slippagePercent?: string;
  signatureData?: string[];
}

export interface AggregatorSwapBuild {
  routerResult?: AggregatorQuoteRoute;
  tx?: AggregatorSwapTransaction;
  executionMode?: string;
  rfq?: {
    vendor?: string;
    txType?: string;
    typedDataToSign?: string;
    signingScheme?: string;
    signatureData?: string[];
  } | null;
}

export function buildSwapTransaction(params: {
  chainId: string;
  amountRaw: string;
  fromToken: string;
  toToken: string;
  wallet: string;
  quoteId: string;
  slippagePercent: string;
}): Promise<BinanceEnvelope<AggregatorSwapBuild | null>> {
  return binanceSignedGet<AggregatorSwapBuild | null>(
    "/api/v1/dex/aggregator/swap",
    {
      binanceChainId: params.chainId,
      amount: params.amountRaw,
      fromTokenAddress: params.fromToken,
      toTokenAddress: params.toToken,
      userWalletAddress: params.wallet,
      quoteId: params.quoteId,
      slippagePercent: params.slippagePercent,
    },
  );
}