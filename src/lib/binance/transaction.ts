import "server-only";

import { binanceSignedPost, type BinanceEnvelope } from "./client";

export interface EvmSimulationTransaction {
  from: string;
  to: string;
  value: string;
  data: string;
}

export interface SimulationBalanceChange {
  contractAddress?: string;
  tokenType?: string;
  change?: string;
  owner?: string;
}

export interface SimulationAllowanceChange {
  tokenAddress?: string;
  owner?: string;
  spender?: string;
  preAmount?: string;
  postAmount?: string;
}

export interface EvmSimulationResult {
  status?: string;
  failReason?: string | null;
  balanceChanges?: SimulationBalanceChange[];
  allowanceChanges?: SimulationAllowanceChange[];
}

export function simulateEvmTransaction(params: {
  chainId: string;
  tx: EvmSimulationTransaction;
}): Promise<BinanceEnvelope<EvmSimulationResult | null>> {
  return binanceSignedPost<EvmSimulationResult | null>(
    "/api/v1/dex/pre-transaction/simulate",
    {
      binanceChainId: params.chainId,
      evmTx: params.tx,
    },
  );
}
