import "server-only";

import { createEvmReadOnlyRpc, type EvmReadOnlyRpc } from "./evm-rpc";

export type ConfiguredWalletRpc =
  | {
      status: "CONFIGURED";
      rpc: EvmReadOnlyRpc;
    }
  | {
      status: "NOT_CONFIGURED";
      reason: string;
    };

export function getConfiguredWalletRpc(options?: {
  signal?: AbortSignal;
  timeoutMs?: number;
}): ConfiguredWalletRpc {
  const rpcUrl = process.env.UNDERLY_RPC_URL?.trim();

  if (!rpcUrl) {
    return {
      status: "NOT_CONFIGURED",
      reason:
        "UNDERLY_RPC_URL is required for read-only on-chain balance inspection.",
    };
  }

  return {
    status: "CONFIGURED",
    rpc: createEvmReadOnlyRpc(rpcUrl, fetch, options),
  };
}
