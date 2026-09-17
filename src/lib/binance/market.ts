import "server-only";

import { binanceSignedGet, type BinanceEnvelope } from "./client";

export const CANDLE_BARS = [
  "1s",
  "5s",
  "30s",
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
] as const;

export type CandleBar = (typeof CANDLE_BARS)[number];

export type BinanceCandleValue = string | number;

export type BinanceCandleRow = [
  BinanceCandleValue,
  BinanceCandleValue,
  BinanceCandleValue,
  BinanceCandleValue,
  BinanceCandleValue,
  BinanceCandleValue,
  BinanceCandleValue,
];

export function getCandles(params: {
  chainId: string;
  contractAddress: string;
  bar: CandleBar;
  limit: number;
  start?: number;
  end?: number;
}): Promise<BinanceEnvelope<BinanceCandleRow[]>> {
  return binanceSignedGet<BinanceCandleRow[]>(
    "/api/v1/dex/market/candles",
    {
      binanceChainId: params.chainId,
      tokenContractAddress: params.contractAddress,
      bar: params.bar,
      // Binance names are counter-intuitive:
      // `before` = lower/start bound; `after` = upper/end bound.
      before: params.start,
      after: params.end,
      limit: params.limit,
    },
  );
}
