import { NextRequest, NextResponse } from "next/server";

import { listBscRwaTokens } from "@/lib/binance/rwa";
import {
  enrichPortfolioMetadata,
  PORTFOLIO_PROFILE_CACHE_TTL_MS,
  preparePortfolioUniverse,
  type PortfolioProviderObservation,
} from "@/lib/portfolio/source";
import {
  inspectPortfolioSnapshotWithMulticall,
  PORTFOLIO_MULTICALL_BATCH_SIZE,
  PORTFOLIO_MULTICALL_CONCURRENCY,
  PORTFOLIO_MULTICALL_TIMEOUT_MS,
} from "@/lib/portfolio/multicall";
import {
  buildUnifiedPortfolio,
  type PortfolioBalanceInput,
} from "@/lib/underly/portfolio";
import {
  isEvmAddress,
  normalizeEvmAddress,
  parseHexQuantity,
} from "@/lib/wallet/evm-rpc";
import { getConfiguredWalletRpc } from "@/lib/wallet/provider";

export const runtime = "nodejs";

const BSC_CHAIN_ID = "56";
const UPSTREAM_TIMEOUT_MS = 10_000;
const METADATA_ENTRY_CONCURRENCY = 4;

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(2));
}

function providerMetrics(
  observations: PortfolioProviderObservation[],
  endpoint: PortfolioProviderObservation["endpoint"],
) {
  const matches = observations.filter(
    (observation) => observation.endpoint === endpoint,
  );
  const durations = matches.map((observation) => observation.durationMs);
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  return {
    calls: matches.filter((observation) => observation.cache !== "HIT").length,
    cacheHits: matches.filter((observation) => observation.cache === "HIT").length,
    itemCount: matches.reduce(
      (sum, observation) => sum + observation.itemCount,
      0,
    ),
    averageMs: matches.length
      ? Number((total / matches.length).toFixed(2))
      : 0,
    maximumMs: durations.length
      ? Number(Math.max(...durations).toFixed(2))
      : 0,
    errorCount: matches.filter(
      (observation) => observation.status !== "AVAILABLE",
    ).length,
  };
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("UPSTREAM_TIMEOUT")),
          UPSTREAM_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function readOnlyBoundary(rpcMethods: string[]) {
  return {
    enabled: true,
    rpcMethods,
    transactionMethods: [] as string[],
    privateKeyRequired: false,
    signatureRequired: false,
    approvalRequired: false,
    quoteRequested: false,
    transactionBuilt: false,
    simulationRequested: false,
  };
}

function unavailable(params: {
  generatedAt: string;
  address: string;
  error: string;
  statusCode?: number;
  rpcMethods?: string[];
  extra?: Record<string, unknown>;
}) {
  return jsonNoStore(
    {
      version: "0.7-A",
      generatedAt: params.generatedAt,
      address: params.address,
      chainId: BSC_CHAIN_ID,
      status: "UNAVAILABLE",
      error: params.error,
      positions: [],
      underlyingExposures: [],
      balanceChecks: [],
      ...params.extra,
      readOnly: readOnlyBoundary(params.rpcMethods ?? []),
    },
    params.statusCode ?? 502,
  );
}

export async function GET(request: NextRequest) {
  const requestStartedAt = performance.now();
  const suppliedAddress =
    new URL(request.url).searchParams.get("address")?.trim() ?? "";

  if (!suppliedAddress) {
    return jsonNoStore({ error: "address is required" }, 400);
  }
  if (!isEvmAddress(suppliedAddress)) {
    return jsonNoStore({ error: "address must be a valid EVM address" }, 400);
  }

  const address = normalizeEvmAddress(suppliedAddress);
  const generatedAt = new Date().toISOString();
  const configuredRpc = getConfiguredWalletRpc();
  if (configuredRpc.status === "NOT_CONFIGURED") {
    return jsonNoStore(
      {
        version: "0.7-A",
        generatedAt,
        address,
        chainId: BSC_CHAIN_ID,
        status: "NOT_CONFIGURED",
        error: "READ_ONLY_RPC_NOT_CONFIGURED",
        positions: [],
        underlyingExposures: [],
        balanceChecks: [],
        readOnly: readOnlyBoundary([
          "eth_chainId",
          "eth_blockNumber",
          "eth_getCode",
          "eth_call",
        ]),
      },
      503,
    );
  }

  const rpc = configuredRpc.rpc;
  try {
    const chainStartedAt = performance.now();
    const rpcChainId = parseHexQuantity(await rpc.getChainId()).toString(10);
    const chainVerificationMs = elapsed(chainStartedAt);
    if (rpcChainId !== BSC_CHAIN_ID) {
      return unavailable({
        generatedAt,
        address,
        error: "RPC_CHAIN_MISMATCH",
        rpcMethods: ["eth_chainId"],
        extra: {
          expectedChainId: BSC_CHAIN_ID,
          observedRpcChainId: rpcChainId,
        },
      });
    }

    const blockStartedAt = performance.now();
    const blockTag = await rpc.getBlockNumber();
    const blockNumber = parseHexQuantity(blockTag).toString(10);
    const blockSnapshotMs = elapsed(blockStartedAt);
    const universeStartedAt = performance.now();
    const universeResponse = await withTimeout(listBscRwaTokens(BSC_CHAIN_ID));
    const universeDiscoveryMs = elapsed(universeStartedAt);
    if (universeResponse.code !== 0 || !Array.isArray(universeResponse.data)) {
      return unavailable({
        generatedAt,
        address,
        error:
          universeResponse.code === 0
            ? "RWA_UNIVERSE_INVALID"
            : `RWA_UNIVERSE_UPSTREAM_${universeResponse.code}`,
        rpcMethods: ["eth_chainId", "eth_blockNumber"],
        extra: {
          snapshot: {
            rpcChainId,
            blockTag,
            blockNumber,
            blockTimestamp: null,
            blockTimestampStatus: "UNAVAILABLE",
          },
        },
      });
    }

    const universe = preparePortfolioUniverse(
      universeResponse.data,
      BSC_CHAIN_ID,
    );
    const balancesStartedAt = performance.now();
    const inspection = await inspectPortfolioSnapshotWithMulticall({
      address,
      blockTag,
      wrappers: universe.entries.map((entry) => entry.wrapper),
      rpcUrl: process.env.UNDERLY_RPC_URL ?? "",
    });
    const balanceRpcMs = elapsed(balancesStartedAt);
    const entryByContract = new Map(
      universe.entries.map((entry) => [
        entry.wrapper.contractAddress,
        entry,
      ]),
    );
    const positiveEntries = inspection.checks.flatMap((check) => {
      if (
        check.status !== "OK" ||
        check.balanceBaseUnits === null ||
        BigInt(check.balanceBaseUnits) === 0n
      ) {
        return [];
      }
      const entry = entryByContract.get(check.wrapper.contractAddress);
      return entry ? [entry] : [];
    });
    const providerObservations: PortfolioProviderObservation[] = [];
    const enrichmentStartedAt = performance.now();
    const metadata = await enrichPortfolioMetadata({
      entries: positiveEntries,
      concurrency: METADATA_ENTRY_CONCURRENCY,
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      observe: (observation) => providerObservations.push(observation),
    });
    const metadataEnrichmentMs = elapsed(enrichmentStartedAt);
    const balances: PortfolioBalanceInput[] = inspection.checks.map((check) => ({
      chainId: check.wrapper.chainId,
      contractAddress: check.wrapper.contractAddress,
      status: check.status,
      blockTag: check.blockTag,
      rawBalanceHex: check.rawBalanceHex,
      balanceBaseUnits: check.balanceBaseUnits,
      error: check.status === "ERROR" ? "RPC_BALANCE_READ_FAILED" : null,
    }));
    const calculationStartedAt = performance.now();
    const portfolio = buildUnifiedPortfolio({
      chainId: BSC_CHAIN_ID,
      balances,
      assets: metadata,
    });
    const portfolioCalculationMs = elapsed(calculationStartedAt);
    const status =
      universe.rejected.length === 0 || portfolio.status !== "AVAILABLE"
        ? portfolio.status
        : universe.entries.length === 0
          ? "UNAVAILABLE"
          : "PARTIAL";

    const payload = {
        version: "0.7-A",
        generatedAt,
        address,
        chainId: BSC_CHAIN_ID,
        status,
        scope: "BSC_TOKENIZED_EQUITY_WRAPPERS_ONLY",
        snapshot: {
          rpcChainId,
          blockTag,
          blockNumber,
          blockTimestamp: null,
          blockTimestampStatus: "UNAVAILABLE",
          blockTimestampReason:
            "The configured read-only RPC adapter does not expose block timestamps.",
        },
        universe: {
          source: "BINANCE_WEB3_RWA",
          receivedCount: universeResponse.data.length,
          validatedWrapperCount: universe.entries.length,
          rejectedCount: universe.rejected.length,
          rejected: universe.rejected,
        },
        summary: portfolio.summary,
        positions: portfolio.positions,
        underlyingExposures: portfolio.underlyingExposures,
        balanceChecks: portfolio.balanceChecks,
        sources: {
          wrapperUniverse: "BINANCE_WEB3_RWA",
          balances: "EVM_JSON_RPC",
          equivalence: "BINANCE_RWA_PROFILE_OR_VALIDATED_UNIVERSE",
          valuation: "BINANCE_RWA_PRICE_OR_VALIDATED_UNIVERSE",
        },
        methodology: {
          identity:
            "Underlying aggregation requires an explicit Binance RWA underlyingTicker on the exact chain-and-contract universe row. Names, logos, and wrapper-symbol similarity are never identity evidence.",
          snapshot:
            "Every ERC-20 balanceOf call uses the same explicit BSC block tag returned by eth_blockNumber.",
          balances:
            "A verified BSC Multicall3 aggregate3 read uses allowFailure=true at the same explicit block tag. Each inner result retains per-contract success or RPC_ERROR evidence; failures are never converted to zero.",
          enrichment:
            "Price, profile, market session, equivalence, ActionGuard, and integrity evidence are requested only for wrappers with a proven positive balance. Prices use the provider's documented batch contract, profile metadata has an explicit short TTL cache, and all other calls preserve bounded concurrency and explicit timeout/error states.",
          valuation:
            "Portfolio values are indicative current-snapshot estimates, not executable prices or guarantees. No historical P&L, cost basis, investment return, or dividend entitlement is inferred.",
        },
        performance: {
          unit: "milliseconds",
          totalBeforeSerializationMs: elapsed(requestStartedAt),
          stages: {
            chainVerificationMs,
            blockSnapshotMs,
            universeDiscoveryMs,
            balanceRpcMs,
            metadataEnrichmentMs,
            portfolioCalculationMs,
          },
          calls: {
            rpc: {
              chainVerification: 1,
              blockSnapshot: 1,
              multicallContractCode: inspection.multicall.contractCodeChecks,
              balanceBatches: inspection.multicall.batchCalls,
              balanceOfInnerCalls: universe.entries.length,
            },
            provider: {
              universe: 1,
              price: providerMetrics(providerObservations, "price"),
              profile: providerMetrics(providerObservations, "profile"),
              market: providerMetrics(providerObservations, "market"),
            },
          },
          controls: {
            balanceStrategy: "VERIFIED_BSC_MULTICALL3",
            multicallBatchSize: PORTFOLIO_MULTICALL_BATCH_SIZE,
            multicallConcurrency: PORTFOLIO_MULTICALL_CONCURRENCY,
            multicallTimeoutMs: PORTFOLIO_MULTICALL_TIMEOUT_MS,
            multicallContractCodeVerified:
              inspection.multicall.contractCodeVerified,
            metadataEntryConcurrency: METADATA_ENTRY_CONCURRENCY,
            priceBatchSize: 100,
            profileCacheTtlMs: PORTFOLIO_PROFILE_CACHE_TTL_MS,
            balanceCache: "DISABLED",
            priceCache: "DISABLED",
            marketCache: "DISABLED",
            upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
          },
        },
        readOnly: readOnlyBoundary([
          "eth_chainId",
          "eth_blockNumber",
          "eth_getCode",
          "eth_call",
        ]),
      };
    const serializationStartedAt = performance.now();
    const response = jsonNoStore(
      payload,
      status === "UNAVAILABLE" ? 502 : 200,
    );
    const serializationMs = elapsed(serializationStartedAt);
    response.headers.set(
      "server-timing",
      [
        `portfolio;dur=${elapsed(requestStartedAt)}`,
        `chain;dur=${chainVerificationMs}`,
        `block;dur=${blockSnapshotMs}`,
        `universe;dur=${universeDiscoveryMs}`,
        `balances;dur=${balanceRpcMs}`,
        `metadata;dur=${metadataEnrichmentMs}`,
        `calculation;dur=${portfolioCalculationMs}`,
        `serialization;dur=${serializationMs}`,
      ].join(", "),
    );
    return response;
  } catch (error) {
    return unavailable({
      generatedAt,
      address,
      error:
        error instanceof Error && error.message === "UPSTREAM_TIMEOUT"
          ? "RWA_UNIVERSE_TIMEOUT"
          : "PORTFOLIO_READ_FAILED",
      rpcMethods: [
        "eth_chainId",
        "eth_blockNumber",
        "eth_getCode",
        "eth_call",
      ],
    });
  }
}
