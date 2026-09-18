import { NextRequest, NextResponse } from "next/server";

import {
  getCandles,
  type BinanceCandleRow,
} from "@/lib/binance/market";
import {
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import {
  isReferencePriceConsistent,
  resolveMoverConsensus,
  type MoverEvidenceStatus,
} from "@/lib/underly/landing-ranking";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 8;
const INITIAL_MOVER_CANDIDATE_LIMIT = 12;
const MAX_MOVER_CANDIDATE_LIMIT = 24;
const TARGET_MOVERS_PER_SIDE = 4;
const VERIFICATION_BUFFER_PER_SIDE = 2;
const MAX_WRAPPERS_PER_MOVER = 2;
const PRIMARY_CANDLE_CONCURRENCY = 8;
const CANDLE_CONCURRENCY = 6;
const CONSENSUS_MAX_SPREAD_PCT_POINTS = 5;
const MAX_REFERENCE_DEVIATION_PCT = 15;
const CACHE_TTL_MS = 300_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type RankingScope = "hot" | "movers";

interface WrapperSeed {
  provider: string;
  contractAddress: string;
}

interface RankedUnderlying {
  ticker: string;
  name: string;
  wrapperCount: number;
  providers: string[];
  chainId: string | null;
  reportedVolume24H: number | null;
  priceChangePct24H: number | null;
  referencePriceUsd: number | null;
  moverEvidence: {
    status: MoverEvidenceStatus | null;
    wrapperSamples: number;
    spreadPctPoints: number | null;
  };
}

interface UnderlyingSeed extends RankedUnderlying {
  wrappersForMover: WrapperSeed[];
}

interface SeedSnapshot {
  generatedAt: string;
  universeCount: number;
  volumeRanked: number;
  seeds: UnderlyingSeed[];
}

interface MoversSnapshot {
  generatedAt: string;
  moverCandidates: number;
  moversScanned: number;
  moversRejected: number;
  gainers: RankedUnderlying[];
  losers: RankedUnderlying[];
}

interface WrapperMoveTask {
  ticker: string;
  wrapperCount: number;
  provider: string;
  contractAddress: string;
}

interface WrapperMoveResult {
  ticker: string;
  provider: string;
  changePct: number | null;
  lastClose: number | null;
}

interface PrimaryProbe {
  seed: UnderlyingSeed;
  primary: WrapperMoveResult | null;
}

let seedCache:
  | {
      expiresAt: number;
      value: SeedSnapshot;
    }
  | null = null;

let seedInFlight: Promise<SeedSnapshot> | null = null;

let moversCache:
  | {
      expiresAt: number;
      value: MoversSnapshot;
    }
  | null = null;

let moversInFlight: Promise<MoversSnapshot> | null = null;

function parseLimit(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_LIMIT;
  if (!/^\d+$/.test(value)) return DEFAULT_LIMIT;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_LIMIT;

  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

function parseScope(value: string | null): RankingScope {
  return value === "movers" ? "movers" : "hot";
}

function finiteNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function medianNullable(values: Array<number | null>): number | null {
  const valid = values
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (!valid.length) return null;

  const middle = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) return valid[middle];

  return (valid[middle - 1] + valid[middle]) / 2;
}

function normalizedTicker(asset: RwaTokenListRow): string {
  return (asset.underlyingTicker ?? asset.tokenSymbol)
    .trim()
    .toUpperCase();
}

function normalizedName(
  asset: RwaTokenListRow,
  ticker: string,
): string {
  return (
    asset.underlyingFullName ??
    asset.companyName ??
    ticker
  ).trim();
}

function dedupeAssets(
  assets: RwaTokenListRow[],
): RwaTokenListRow[] {
  const seen = new Set<string>();
  const result: RwaTokenListRow[] = [];

  for (const asset of assets) {
    const key = asset.tokenContractAddress.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
}

function aggregateUniverse(
  assets: RwaTokenListRow[],
  chainId: string,
): UnderlyingSeed[] {
  const grouped = new Map<string, RwaTokenListRow[]>();

  for (const asset of dedupeAssets(assets)) {
    if (String(asset.binanceChainId) !== chainId) continue;

    const ticker = normalizedTicker(asset);
    const current = grouped.get(ticker) ?? [];
    current.push(asset);
    grouped.set(ticker, current);
  }

  return Array.from(grouped.entries()).map(
    ([ticker, wrappers]) => {
      const ordered = [...wrappers].sort(
        (a, b) =>
          (finiteNumber(b.volume24H) ?? -1) -
            (finiteNumber(a.volume24H) ?? -1) ||
          (a.platformId ?? "").localeCompare(
            b.platformId ?? "",
          ),
      );

      const representative = ordered[0] ?? wrappers[0];
      const bestVolume =
        ordered
          .map((asset) => finiteNumber(asset.volume24H))
          .find((value) => value !== null) ?? null;

      const referencePriceUsd = medianNullable(
        ordered.map((asset) =>
          finiteNumber(asset.referencePrice),
        ),
      );

      const wrappersForMover = ordered
        .slice(0, MAX_WRAPPERS_PER_MOVER)
        .map((asset) => ({
          provider:
            asset.platformId?.trim() || "unknown",
          contractAddress:
            asset.tokenContractAddress,
        }));

      return {
        ticker,
        name: normalizedName(representative, ticker),
        wrapperCount: wrappers.length,
        providers: Array.from(
          new Set(
            wrappers.map(
              (asset) =>
                asset.platformId?.trim() || "unknown",
            ),
          ),
        ).sort(),
        chainId:
          representative.binanceChainId !== undefined
            ? String(representative.binanceChainId)
            : chainId,
        reportedVolume24H: bestVolume,
        priceChangePct24H: null,
        referencePriceUsd,
        moverEvidence: {
          status: null,
          wrapperSamples: 0,
          spreadPctPoints: null,
        },
        wrappersForMover,
      };
    },
  );
}

function cleanSeed(seed: UnderlyingSeed): RankedUnderlying {
  return {
    ticker: seed.ticker,
    name: seed.name,
    wrapperCount: seed.wrapperCount,
    providers: seed.providers,
    chainId: seed.chainId,
    reportedVolume24H: seed.reportedVolume24H,
    priceChangePct24H: seed.priceChangePct24H,
    referencePriceUsd: seed.referencePriceUsd,
    moverEvidence: seed.moverEvidence,
  };
}

async function buildSeedSnapshot(): Promise<SeedSnapshot> {
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";
  const universe = await listBscRwaTokens(chainId);

  if (universe.code !== 0) {
    throw new Error(universe.msg);
  }

  const seeds = aggregateUniverse(
    universe.data ?? [],
    chainId,
  ).sort(
    (a, b) =>
      (b.reportedVolume24H ?? -1) -
        (a.reportedVolume24H ?? -1) ||
      b.wrapperCount - a.wrapperCount ||
      a.ticker.localeCompare(b.ticker),
  );

  return {
    generatedAt: new Date().toISOString(),
    universeCount: seeds.length,
    volumeRanked: seeds.filter(
      (item) => item.reportedVolume24H !== null,
    ).length,
    seeds,
  };
}

async function getSeedSnapshot(): Promise<SeedSnapshot> {
  const now = Date.now();

  if (seedCache && seedCache.expiresAt > now) {
    return seedCache.value;
  }

  if (!seedInFlight) {
    seedInFlight = buildSeedSnapshot()
      .then((value) => {
        seedCache = {
          expiresAt: Date.now() + CACHE_TTL_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        seedInFlight = null;
      });
  }

  return seedInFlight;
}

function candleClose(row: BinanceCandleRow): number | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  return finiteNumber(row[3]);
}

function candleTimestamp(row: BinanceCandleRow): number | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  return finiteNumber(row[5]);
}

async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          Math.max(items.length, 1),
        ),
      },
      () => run(),
    ),
  );

  return results;
}

async function fetchWrapperMove(
  task: WrapperMoveTask,
  chainId: string,
  start: number,
  end: number,
): Promise<WrapperMoveResult> {
  try {
    const envelope = await getCandles({
      chainId,
      contractAddress: task.contractAddress,
      bar: "4h",
      limit: 8,
      start,
      end,
    });

    if (envelope.code !== 0) {
      return {
        ticker: task.ticker,
        provider: task.provider,
        changePct: null,
        lastClose: null,
      };
    }

    const candles = (envelope.data ?? [])
      .map((row) => ({
        close: candleClose(row),
        timestamp: candleTimestamp(row),
      }))
      .filter(
        (
          item,
        ): item is {
          close: number;
          timestamp: number;
        } =>
          item.close !== null &&
          item.timestamp !== null &&
          item.timestamp >= start &&
          item.timestamp <= end,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const first = candles[0];
    const last = candles.at(-1);

    if (!first || !last || first.close <= 0) {
      return {
        ticker: task.ticker,
        provider: task.provider,
        changePct: null,
        lastClose: null,
      };
    }

    return {
      ticker: task.ticker,
      provider: task.provider,
      changePct:
        ((last.close - first.close) / first.close) * 100,
      lastClose: last.close,
    };
  } catch {
    return {
      ticker: task.ticker,
      provider: task.provider,
      changePct: null,
      lastClose: null,
    };
  }
}

function usableWrapperSample(
  item: UnderlyingSeed,
  sample: WrapperMoveResult | null,
): sample is WrapperMoveResult & {
  changePct: number;
  lastClose: number;
} {
  if (
    !sample ||
    sample.changePct === null ||
    sample.lastClose === null
  ) {
    return false;
  }

  if (item.referencePriceUsd === null) {
    return item.wrapperCount > 1;
  }

  return isReferencePriceConsistent(
    sample.lastClose,
    item.referencePriceUsd,
    MAX_REFERENCE_DEVIATION_PCT,
  );
}

async function probePrimaryBatch(
  candidates: UnderlyingSeed[],
  chainId: string,
  start: number,
  end: number,
): Promise<PrimaryProbe[]> {
  const tasks = candidates
    .map((seed) => {
      const wrapper = seed.wrappersForMover[0];

      if (!wrapper) {
        return null;
      }

      return {
        seed,
        task: {
          ticker: seed.ticker,
          wrapperCount: seed.wrapperCount,
          provider: wrapper.provider,
          contractAddress: wrapper.contractAddress,
        } satisfies WrapperMoveTask,
      };
    })
    .filter(
      (
        item,
      ): item is {
        seed: UnderlyingSeed;
        task: WrapperMoveTask;
      } => item !== null,
    );

  const results = await mapLimit(
    tasks,
    PRIMARY_CANDLE_CONCURRENCY,
    ({ task }) =>
      fetchWrapperMove(
        task,
        chainId,
        start,
        end,
      ),
  );

  return tasks.map((item, index) => ({
    seed: item.seed,
    primary: results[index] ?? null,
  }));
}

function provisionalDirectionCounts(
  probes: PrimaryProbe[],
): {
  gainers: number;
  losers: number;
} {
  let gainers = 0;
  let losers = 0;

  for (const probe of probes) {
    if (
      !usableWrapperSample(
        probe.seed,
        probe.primary,
      )
    ) {
      continue;
    }

    const move = probe.primary.changePct;

    if (move > 0) gainers += 1;
    if (move < 0) losers += 1;
  }

  return {
    gainers,
    losers,
  };
}

function singleSourceResult(
  probe: PrimaryProbe,
): RankedUnderlying | null {
  if (probe.seed.wrapperCount > 1) {
    return null;
  }

  const samples = usableWrapperSample(
    probe.seed,
    probe.primary,
  )
    ? [
        {
          provider: probe.primary.provider,
          changePct: probe.primary.changePct,
        },
      ]
    : [];

  const consensus = resolveMoverConsensus(
    probe.seed.wrapperCount,
    samples,
    CONSENSUS_MAX_SPREAD_PCT_POINTS,
  );

  return {
    ...cleanSeed(probe.seed),
    priceChangePct24H: consensus.changePct,
    moverEvidence: {
      status: consensus.status,
      wrapperSamples: consensus.wrapperSamples,
      spreadPctPoints: consensus.spreadPctPoints,
    },
  };
}

function selectVerificationProbes(
  probes: PrimaryProbe[],
  singleSourceResults: RankedUnderlying[],
): PrimaryProbe[] {
  const acceptedSingles = singleSourceResults.filter(
    (item) => item.priceChangePct24H !== null,
  );

  const acceptedPositiveSingles = acceptedSingles.filter(
    (item) => (item.priceChangePct24H ?? 0) > 0,
  ).length;
  const acceptedNegativeSingles = acceptedSingles.filter(
    (item) => (item.priceChangePct24H ?? 0) < 0,
  ).length;

  const positiveBudget =
    Math.max(
      0,
      TARGET_MOVERS_PER_SIDE - acceptedPositiveSingles,
    ) + VERIFICATION_BUFFER_PER_SIDE;

  const negativeBudget =
    Math.max(
      0,
      TARGET_MOVERS_PER_SIDE - acceptedNegativeSingles,
    ) + VERIFICATION_BUFFER_PER_SIDE;

  const eligible = probes.filter(
    (probe) =>
      probe.seed.wrapperCount > 1 &&
      probe.seed.wrappersForMover.length > 1 &&
      usableWrapperSample(
        probe.seed,
        probe.primary,
      ),
  );

  const positives = eligible
    .filter(
      (probe) =>
        (probe.primary?.changePct ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (b.primary?.changePct ?? -Infinity) -
        (a.primary?.changePct ?? -Infinity),
    )
    .slice(0, positiveBudget);

  const negatives = eligible
    .filter(
      (probe) =>
        (probe.primary?.changePct ?? 0) < 0,
    )
    .sort(
      (a, b) =>
        (a.primary?.changePct ?? Infinity) -
        (b.primary?.changePct ?? Infinity),
    )
    .slice(0, negativeBudget);

  return [...positives, ...negatives];
}

async function verifySelectedProbes(
  probes: PrimaryProbe[],
  chainId: string,
  start: number,
  end: number,
): Promise<RankedUnderlying[]> {
  const tasks = probes
    .map((probe) => {
      const wrapper = probe.seed.wrappersForMover[1];

      if (!wrapper) {
        return null;
      }

      return {
        probe,
        task: {
          ticker: probe.seed.ticker,
          wrapperCount: probe.seed.wrapperCount,
          provider: wrapper.provider,
          contractAddress: wrapper.contractAddress,
        } satisfies WrapperMoveTask,
      };
    })
    .filter(
      (
        item,
      ): item is {
        probe: PrimaryProbe;
        task: WrapperMoveTask;
      } => item !== null,
    );

  const secondaries = await mapLimit(
    tasks,
    CANDLE_CONCURRENCY,
    ({ task }) =>
      fetchWrapperMove(
        task,
        chainId,
        start,
        end,
      ),
  );

  return tasks.map((item, index) => {
    const secondary = secondaries[index] ?? null;
    const samples = [
      item.probe.primary,
      secondary,
    ]
      .filter(
        (
          sample,
        ): sample is WrapperMoveResult & {
          changePct: number;
          lastClose: number;
        } =>
          usableWrapperSample(
            item.probe.seed,
            sample,
          ),
      )
      .map((sample) => ({
        provider: sample.provider,
        changePct: sample.changePct,
      }));

    const consensus = resolveMoverConsensus(
      item.probe.seed.wrapperCount,
      samples,
      CONSENSUS_MAX_SPREAD_PCT_POINTS,
    );

    return {
      ...cleanSeed(item.probe.seed),
      priceChangePct24H: consensus.changePct,
      moverEvidence: {
        status: consensus.status,
        wrapperSamples: consensus.wrapperSamples,
        spreadPctPoints: consensus.spreadPctPoints,
      },
    } satisfies RankedUnderlying;
  });
}

async function finalizePrimaryProbes(
  probes: PrimaryProbe[],
  chainId: string,
  start: number,
  end: number,
): Promise<RankedUnderlying[]> {
  const singles = probes
    .map(singleSourceResult)
    .filter(
      (
        item,
      ): item is RankedUnderlying =>
        item !== null,
    );

  const verificationProbes =
    selectVerificationProbes(
      probes,
      singles,
    );

  const verified = await verifySelectedProbes(
    verificationProbes,
    chainId,
    start,
    end,
  );

  return [...singles, ...verified];
}

function splitMovers(items: RankedUnderlying[]) {
  const usable = items.filter(
    (item) => item.priceChangePct24H !== null,
  );

  const gainers = usable
    .filter((item) => (item.priceChangePct24H ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.priceChangePct24H ?? -Infinity) -
          (a.priceChangePct24H ?? -Infinity) ||
        (b.referencePriceUsd ?? 0) -
          (a.referencePriceUsd ?? 0),
    );

  const losers = usable
    .filter((item) => (item.priceChangePct24H ?? 0) < 0)
    .sort(
      (a, b) =>
        (a.priceChangePct24H ?? Infinity) -
          (b.priceChangePct24H ?? Infinity) ||
        (b.referencePriceUsd ?? 0) -
          (a.referencePriceUsd ?? 0),
    );

  return {
    usable,
    gainers,
    losers,
    rejected: items.filter(
      (item) => item.moverEvidence.status === "REJECTED",
    ).length,
  };
}

async function buildMoversSnapshot(): Promise<MoversSnapshot> {
  const chainId = process.env.UNDERLY_CHAIN_ID || "56";
  const seed = await getSeedSnapshot();

  const candidatePool = seed.seeds
    .filter(
      (item) => item.wrappersForMover.length > 0,
    )
    .slice(0, MAX_MOVER_CANDIDATE_LIMIT);

  const end = Date.now();
  const start = end - DAY_MS;

  const firstBatch = candidatePool.slice(
    0,
    INITIAL_MOVER_CANDIDATE_LIMIT,
  );

  const firstProbes = await probePrimaryBatch(
    firstBatch,
    chainId,
    start,
    end,
  );

  let probes = firstProbes;
  let provisional =
    provisionalDirectionCounts(probes);

  const provisionalTarget =
    TARGET_MOVERS_PER_SIDE +
    VERIFICATION_BUFFER_PER_SIDE;

  const needMorePrimaryCoverage =
    provisional.gainers < provisionalTarget ||
    provisional.losers < provisionalTarget;

  if (
    needMorePrimaryCoverage &&
    candidatePool.length >
      INITIAL_MOVER_CANDIDATE_LIMIT
  ) {
    const secondBatch = candidatePool.slice(
      INITIAL_MOVER_CANDIDATE_LIMIT,
      MAX_MOVER_CANDIDATE_LIMIT,
    );

    const secondProbes = await probePrimaryBatch(
      secondBatch,
      chainId,
      start,
      end,
    );

    probes = [...probes, ...secondProbes];
    provisional =
      provisionalDirectionCounts(probes);
  }

  const resolved = await finalizePrimaryProbes(
    probes,
    chainId,
    start,
    end,
  );

  const split = splitMovers(resolved);

  return {
    generatedAt: new Date().toISOString(),
    moverCandidates: probes.length,
    moversScanned: split.usable.length,
    moversRejected: split.rejected,
    gainers: split.gainers,
    losers: split.losers,
  };
}

async function getMoversSnapshot(): Promise<MoversSnapshot> {
  const now = Date.now();

  if (moversCache && moversCache.expiresAt > now) {
    return moversCache.value;
  }

  if (!moversInFlight) {
    moversInFlight = buildMoversSnapshot()
      .then((value) => {
        moversCache = {
          expiresAt: Date.now() + CACHE_TTL_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        moversInFlight = null;
      });
  }

  return moversInFlight;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const scope = parseScope(url.searchParams.get("scope"));

  try {
    if (scope === "hot") {
      const seed = await getSeedSnapshot();
      const hot = seed.seeds
        .filter(
          (item) => item.reportedVolume24H !== null,
        )
        .slice(0, limit)
        .map(cleanSeed);

      return NextResponse.json(
        {
          version: "0.2",
          scope,
          generatedAt: seed.generatedAt,
          status: hot.length ? "AVAILABLE" : "UNAVAILABLE",
          sample: {
            universeCount: seed.universeCount,
            volumeRanked: seed.volumeRanked,
            moverCandidates: 0,
            moversScanned: 0,
            moversRejected: 0,
          },
          categories: {
            hot,
            gainers: [],
            losers: [],
          },
          methodology: {
            hot:
              "Ranks underlyings from one cached RWA Token List snapshot using reported volume24H. No quote or liquidity probe is executed.",
            movers:
              "Not requested in this response.",
            sampling:
              "HOT requires no per-ticker fan-out.",
            cacheTtlSeconds: CACHE_TTL_MS / 1000,
          },
          note:
            "HOT is intentionally cheap and loads independently from mover calculations.",
        },
        {
          headers: {
            "Cache-Control":
              "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          },
        },
      );
    }

    const movers = await getMoversSnapshot();

    return NextResponse.json(
      {
        version: "0.2",
        scope,
        generatedAt: movers.generatedAt,
        status:
          movers.gainers.length || movers.losers.length
            ? "AVAILABLE"
            : "UNAVAILABLE",
        sample: {
          universeCount: 0,
          volumeRanked: 0,
          moverCandidates: movers.moverCandidates,
          moversScanned: movers.moversScanned,
          moversRejected: movers.moversRejected,
        },
        categories: {
          hot: [],
          gainers: movers.gainers.slice(0, limit),
          losers: movers.losers.slice(0, limit),
        },
        methodology: {
          hot:
            "Not requested in this response.",
          movers:
            `Each usable wrapper's latest candle close must stay within ${MAX_REFERENCE_DEVIATION_PCT}% of the current underlying referencePrice. Multi-wrapper returns must also agree in direction and stay within ${CONSENSUS_MAX_SPREAD_PCT_POINTS} percentage points. Single-wrapper underlyings are admitted only when this reference-price sanity check passes.`,
          sampling:
            `Mover discovery probes one primary wrapper first with concurrency ${PRIMARY_CANDLE_CONCURRENCY}. It starts with the top ${INITIAL_MOVER_CANDIDATE_LIMIT} highest-volume underlyings and expands to at most ${MAX_MOVER_CANDIDATE_LIMIT} only when provisional directional coverage is sparse. A second wrapper is fetched only for the strongest multi-wrapper candidates needed to fill each side plus a ${VERIFICATION_BUFFER_PER_SIDE}-candidate verification buffer. Consensus verification uses concurrency ${CANDLE_CONCURRENCY}.`,
          priceDisplay:
            "Tile price uses the median current underlying referencePrice from the RWA Token List, not the last wrapper candle.",
          cacheTtlSeconds: CACHE_TTL_MS / 1000,
        },
        note:
          "GAINERS/LOSERS are lazy-loaded. Cross-wrapper disagreement and wrapper prices that diverge materially from the current underlying reference price are rejected instead of becoming leaderboard signals.",
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        version: "0.2",
        scope,
        generatedAt: new Date().toISOString(),
        status: "UNAVAILABLE",
        sample: {
          universeCount: 0,
          volumeRanked: 0,
          moverCandidates: 0,
          moversScanned: 0,
          moversRejected: 0,
        },
        categories: {
          hot: [],
          gainers: [],
          losers: [],
        },
        error:
          error instanceof Error
            ? error.message
            : "Landing rankings request failed",
      },
      { status: 502 },
    );
  }
}
