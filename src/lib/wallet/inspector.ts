import "server-only";

import type { RwaTokenListRow } from "@/lib/binance/rwa";
import {
  formatBaseUnits,
  parseDecimals,
  parseHexQuantity,
  type EvmReadOnlyRpc,
} from "@/lib/wallet/evm-rpc";

export interface WalletWrapperRef {
  ticker: string;
  name: string;
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | null;
  tokenShareRatio: string | null;
}

export interface WalletBalanceCheck {
  wrapper: WalletWrapperRef;
  status: "OK" | "ERROR";
  blockTag: string;
  rawBalanceHex: string | null;
  balanceBaseUnits: string | null;
  quantity: string | null;
  error: string | null;
}

export interface WalletHolding {
  ticker: string;
  name: string;
  platform: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
  decimals: number | null;
  tokenShareRatio: string | null;
  balanceBaseUnits: string;
  quantity: string | null;
  evidence: {
    blockTag: string;
    rawBalanceHex: string;
  };
}

export interface WalletInspectionResult {
  state: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  checks: WalletBalanceCheck[];
  holdings: WalletHolding[];
  successfulChecks: number;
  failedChecks: number;
}

function normalizedTicker(asset: RwaTokenListRow): string {
  return (asset.underlyingTicker ?? asset.tokenSymbol).trim().toUpperCase();
}

function normalizedName(asset: RwaTokenListRow, ticker: string): string {
  return (asset.underlyingFullName ?? asset.companyName ?? ticker).trim();
}

export function prepareWalletWrappers(
  assets: RwaTokenListRow[],
  chainId: string,
): WalletWrapperRef[] {
  const seen = new Set<string>();
  const wrappers: WalletWrapperRef[] = [];

  for (const asset of assets) {
    if (String(asset.binanceChainId) !== chainId) continue;

    const contract = asset.tokenContractAddress?.trim().toLowerCase();
    if (!contract || seen.has(contract)) continue;
    seen.add(contract);

    const ticker = normalizedTicker(asset);
    wrappers.push({
      ticker,
      name: normalizedName(asset, ticker),
      platform: asset.platformId?.trim() || "unknown",
      symbol: asset.tokenSymbol,
      contractAddress: contract,
      chainId,
      decimals: parseDecimals(asset.decimals),
      tokenShareRatio: asset.tokenToShareRatio ?? null,
    });
  }

  return wrappers.sort(
    (a, b) =>
      a.ticker.localeCompare(b.ticker) ||
      a.platform.localeCompare(b.platform) ||
      a.symbol.localeCompare(b.symbol) ||
      a.contractAddress.localeCompare(b.contractAddress),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export async function inspectWalletSnapshot(args: {
  address: string;
  blockTag: string;
  wrappers: WalletWrapperRef[];
  rpc: EvmReadOnlyRpc;
  concurrency?: number;
}): Promise<WalletInspectionResult> {
  const checks = await mapWithConcurrency(
    args.wrappers,
    args.concurrency ?? 6,
    async (wrapper): Promise<WalletBalanceCheck> => {
      try {
        const balance = await args.rpc.getErc20Balance(
          wrapper.contractAddress,
          args.address,
          args.blockTag,
        );
        const baseUnits = parseHexQuantity(balance.rawHex);
        const quantity =
          wrapper.decimals === null
            ? null
            : formatBaseUnits(baseUnits, wrapper.decimals);

        return {
          wrapper,
          status: "OK",
          blockTag: args.blockTag,
          rawBalanceHex: balance.rawHex,
          balanceBaseUnits: baseUnits.toString(10),
          quantity,
          error: null,
        };
      } catch (error) {
        return {
          wrapper,
          status: "ERROR",
          blockTag: args.blockTag,
          rawBalanceHex: null,
          balanceBaseUnits: null,
          quantity: null,
          error:
            error instanceof Error
              ? error.message
              : "Wallet balance read failed",
        };
      }
    },
  );

  const successfulChecks = checks.filter((check) => check.status === "OK").length;
  const failedChecks = checks.length - successfulChecks;

  const holdings: WalletHolding[] = checks
    .filter(
      (check): check is WalletBalanceCheck & {
        rawBalanceHex: string;
        balanceBaseUnits: string;
      } =>
        check.status === "OK" &&
        check.rawBalanceHex !== null &&
        check.balanceBaseUnits !== null &&
        BigInt(check.balanceBaseUnits) > 0n,
    )
    .map((check) => ({
      ticker: check.wrapper.ticker,
      name: check.wrapper.name,
      platform: check.wrapper.platform,
      symbol: check.wrapper.symbol,
      contractAddress: check.wrapper.contractAddress,
      chainId: check.wrapper.chainId,
      decimals: check.wrapper.decimals,
      tokenShareRatio: check.wrapper.tokenShareRatio,
      balanceBaseUnits: check.balanceBaseUnits,
      quantity: check.quantity,
      evidence: {
        blockTag: check.blockTag,
        rawBalanceHex: check.rawBalanceHex,
      },
    }));

  const state: WalletInspectionResult["state"] =
    failedChecks === 0
      ? "AVAILABLE"
      : successfulChecks === 0 && checks.length > 0
        ? "UNAVAILABLE"
        : "PARTIAL";

  return {
    state,
    checks,
    holdings,
    successfulChecks,
    failedChecks,
  };
}
