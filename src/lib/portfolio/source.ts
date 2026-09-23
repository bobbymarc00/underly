import "server-only";

import Decimal from "decimal.js";

import {
  getRwaPrices,
  getUnderlyingMarket,
  getUnderlyingProfile,
  type RwaMarketData,
  type RwaPriceRow,
  type RwaProfile,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import { buildCorporateActionSignal } from "@/lib/underly/actions";
import { buildIntegrity } from "@/lib/underly/integrity";
import { buildPassport } from "@/lib/underly/passport";
import type {
  PortfolioAssetMetadata,
  PortfolioEvidenceRef,
  PortfolioEvidenceStatus,
} from "@/lib/underly/portfolio";
import { isEvmAddress, parseDecimals } from "@/lib/wallet/evm-rpc";
import {
  prepareWalletWrappers,
  type WalletWrapperRef,
} from "@/lib/wallet/inspector";

const PreciseDecimal = Decimal.clone({ precision: 100 });
const PRICE_BATCH_SIZE = 100;
export const PORTFOLIO_PROFILE_CACHE_TTL_MS = 5 * 60_000;

interface CachedProfile {
  captured: Captured<RwaProfile>;
  observedAt: string;
  expiresAt: number;
}

const profileCache = new Map<string, CachedProfile>();

export function clearPortfolioProfileCache(): void {
  profileCache.clear();
}

export interface PortfolioUniverseEntry {
  wrapper: WalletWrapperRef;
  row: RwaTokenListRow;
  underlyingIdentity: string;
  underlyingTicker: string;
  underlyingName: string;
}

export interface PortfolioUniversePreparation {
  entries: PortfolioUniverseEntry[];
  rejected: Array<{
    contractAddress: string | null;
    reason: string;
  }>;
}

export interface PortfolioProviderObservation {
  endpoint: "price" | "market" | "profile";
  durationMs: number;
  status: PortfolioEvidenceStatus;
  itemCount: number;
  cache: "BYPASS" | "HIT" | "MISS";
}

interface Captured<T> {
  status: PortfolioEvidenceStatus;
  value: T | null;
  reason: string | null;
}

function evidence(
  source: string,
  status: PortfolioEvidenceStatus,
  reason: string | null = null,
): PortfolioEvidenceRef {
  return { source, status, reason };
}

function missingEvidenceStatus(
  status: PortfolioEvidenceStatus,
): PortfolioEvidenceStatus {
  return status === "AVAILABLE" ? "UNAVAILABLE" : status;
}

function sameAddress(left?: string | null, right?: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function positiveScalar(value: unknown): string | null {
  const parsed = scalar(value);
  if (!parsed) return null;
  try {
    const number = new PreciseDecimal(parsed);
    return number.isFinite() && number.gt(0) ? number.toFixed() : null;
  } catch {
    return null;
  }
}

function normalizedName(row: RwaTokenListRow, ticker: string): string {
  return (
    row.underlyingFullName ??
    row.underlyingName ??
    row.companyName ??
    ticker
  ).trim();
}

export function preparePortfolioUniverse(
  rows: RwaTokenListRow[],
  chainId: string,
): PortfolioUniversePreparation {
  const wrappers = prepareWalletWrappers(rows, chainId).filter((wrapper) =>
    isEvmAddress(wrapper.contractAddress),
  );
  const rowByContract = new Map<string, RwaTokenListRow>();
  const rejected: PortfolioUniversePreparation["rejected"] = [];

  for (const row of rows) {
    if (String(row.binanceChainId) !== chainId) continue;
    const contract = row.tokenContractAddress?.trim().toLowerCase() ?? null;
    if (!contract || !isEvmAddress(contract)) {
      rejected.push({ contractAddress: contract, reason: "INVALID_CONTRACT_ADDRESS" });
      continue;
    }
    if (!rowByContract.has(contract)) rowByContract.set(contract, row);
  }

  const entries: PortfolioUniverseEntry[] = [];
  for (const wrapper of wrappers) {
    const row = rowByContract.get(wrapper.contractAddress);
    const ticker = row?.underlyingTicker?.trim().toUpperCase() ?? "";
    if (!row || !ticker) {
      rejected.push({
        contractAddress: wrapper.contractAddress,
        reason: "UNDERLYING_IDENTITY_UNAVAILABLE",
      });
      continue;
    }
    entries.push({
      wrapper,
      row,
      underlyingIdentity: `BINANCE_RWA:${chainId}:${ticker}`,
      underlyingTicker: ticker,
      underlyingName: normalizedName(row, ticker),
    });
  }

  return { entries, rejected };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("UPSTREAM_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function captureEnvelope<T>(params: {
  request: Promise<{ code: number; msg: string; data: T }>;
  timeoutMs: number;
}): Promise<Captured<T>> {
  try {
    const envelope = await withTimeout(params.request, params.timeoutMs);
    if (envelope.code !== 0) {
      return {
        status: "ERROR",
        value: null,
        reason: `UPSTREAM_${envelope.code}`,
      };
    }
    if (envelope.data === null || envelope.data === undefined) {
      return { status: "UNAVAILABLE", value: null, reason: "DATA_UNAVAILABLE" };
    }
    return { status: "AVAILABLE", value: envelope.data, reason: null };
  } catch (error) {
    return {
      status: "ERROR",
      value: null,
      reason:
        error instanceof Error && error.message === "UPSTREAM_TIMEOUT"
          ? "UPSTREAM_TIMEOUT"
          : "UPSTREAM_REQUEST_FAILED",
    };
  }
}

async function observeEnvelope<T>(params: {
  endpoint: PortfolioProviderObservation["endpoint"];
  request: Promise<{ code: number; msg: string; data: T }>;
  timeoutMs: number;
  observe?: (observation: PortfolioProviderObservation) => void;
  itemCount?: number;
  cache?: PortfolioProviderObservation["cache"];
}): Promise<Captured<T>> {
  const startedAt = performance.now();
  const captured = await captureEnvelope({
    request: params.request,
    timeoutMs: params.timeoutMs,
  });
  params.observe?.({
    endpoint: params.endpoint,
    durationMs: performance.now() - startedAt,
    status: captured.status,
    itemCount: params.itemCount ?? 1,
    cache: params.cache ?? "BYPASS",
  });
  return captured;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function uniqueEntries(
  entries: PortfolioUniverseEntry[],
): PortfolioUniverseEntry[] {
  const unique = new Map<string, PortfolioUniverseEntry>();
  for (const entry of entries) {
    const key = `${entry.wrapper.chainId}:${entry.wrapper.contractAddress.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, entry);
  }
  return Array.from(unique.values());
}

function profileCacheKey(entry: PortfolioUniverseEntry): string {
  return `${entry.wrapper.chainId}:${entry.wrapper.contractAddress.toLowerCase()}`;
}

async function cachedProfile(params: {
  entry: PortfolioUniverseEntry;
  timeoutMs: number;
  observe?: (observation: PortfolioProviderObservation) => void;
}): Promise<Captured<RwaProfile>> {
  const key = profileCacheKey(params.entry);
  const now = Date.now();
  const cached = profileCache.get(key);
  if (cached && cached.expiresAt > now) {
    params.observe?.({
      endpoint: "profile",
      durationMs: 0,
      status: cached.captured.status,
      itemCount: 1,
      cache: "HIT",
    });
    return {
      ...cached.captured,
      reason: `CACHE_HIT;OBSERVED_AT=${cached.observedAt};TTL_MS=${PORTFOLIO_PROFILE_CACHE_TTL_MS}`,
    };
  }
  if (cached) profileCache.delete(key);

  const profileRaw = await observeEnvelope({
    endpoint: "profile",
    request: getUnderlyingProfile(
      params.entry.wrapper.chainId,
      params.entry.wrapper.contractAddress,
    ),
    timeoutMs: params.timeoutMs,
    observe: params.observe,
    cache: "MISS",
  });
  const profile = validateProfile(profileRaw, params.entry);
  if (profile.status === "AVAILABLE") {
    profileCache.set(key, {
      captured: profile,
      observedAt: new Date().toISOString(),
      expiresAt: now + PORTFOLIO_PROFILE_CACHE_TTL_MS,
    });
  }
  return profile;
}

function validatePrice(
  captured: Captured<RwaPriceRow[]>,
  contract: string,
): Captured<RwaPriceRow> {
  if (captured.status !== "AVAILABLE" || !captured.value) {
    return { ...captured, value: null };
  }
  if (!Array.isArray(captured.value)) {
    return {
      status: "INVALID",
      value: null,
      reason: "PRICE_RESPONSE_INVALID",
    };
  }
  const validRows = captured.value.filter(
    (row): row is RwaPriceRow =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
  const match = validRows.find((row) =>
    sameAddress(row.tokenContractAddress, contract),
  );
  if (match) return { status: "AVAILABLE", value: match, reason: null };
  return {
    status: captured.value.length ? "INVALID" : "UNAVAILABLE",
    value: null,
    reason: captured.value.length
      ? "PRICE_CONTRACT_MISMATCH"
      : "PRICE_DATA_UNAVAILABLE",
  };
}

function validateMarket(
  captured: Captured<RwaMarketData>,
  entry: PortfolioUniverseEntry,
): Captured<RwaMarketData> {
  if (captured.status !== "AVAILABLE" || !captured.value) return captured;
  if (
    String(captured.value.binanceChainId ?? "") !== entry.wrapper.chainId ||
    !sameAddress(captured.value.tokenContractAddress, entry.wrapper.contractAddress)
  ) {
    return {
      status: "INVALID",
      value: null,
      reason: "MARKET_IDENTITY_MISMATCH",
    };
  }
  return captured;
}

function validateProfile(
  captured: Captured<RwaProfile>,
  entry: PortfolioUniverseEntry,
): Captured<RwaProfile> {
  if (captured.status !== "AVAILABLE" || !captured.value) return captured;
  const ticker = captured.value.underlyingTicker?.trim().toUpperCase();
  if (
    String(captured.value.binanceChainId ?? "") !== entry.wrapper.chainId ||
    !sameAddress(captured.value.tokenContractAddress, entry.wrapper.contractAddress) ||
    (ticker !== undefined && ticker !== entry.underlyingTicker)
  ) {
    return {
      status: "INVALID",
      value: null,
      reason: "PROFILE_IDENTITY_MISMATCH",
    };
  }
  return captured;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      () => run(),
    ),
  );
  return results;
}

export async function enrichPortfolioMetadata(params: {
  entries: PortfolioUniverseEntry[];
  concurrency?: number;
  timeoutMs?: number;
  observe?: (observation: PortfolioProviderObservation) => void;
}): Promise<PortfolioAssetMetadata[]> {
  const timeoutMs = params.timeoutMs ?? 10_000;
  const entries = uniqueEntries(params.entries);
  const priceBatches = chunks(entries, PRICE_BATCH_SIZE);
  const pricesPromise = Promise.all(
    priceBatches.map(async (batch) => ({
      contracts: batch.map((entry) => entry.wrapper.contractAddress),
      captured: await observeEnvelope({
        endpoint: "price",
        request: getRwaPrices(
          batch[0].wrapper.chainId,
          batch.map((entry) => entry.wrapper.contractAddress),
        ),
        timeoutMs,
        observe: params.observe,
        itemCount: batch.length,
      }),
    })),
  );
  return mapWithConcurrency(
    entries,
    params.concurrency ?? 3,
    async (entry) => {
      const [priceResults, marketRaw, profile] = await Promise.all([
        pricesPromise,
        observeEnvelope({
          endpoint: "market",
          request: getUnderlyingMarket(
            entry.wrapper.chainId,
            entry.wrapper.contractAddress,
          ),
          timeoutMs,
          observe: params.observe,
        }),
        cachedProfile({
          entry,
          timeoutMs,
          observe: params.observe,
        }),
      ]);
      const priceBatch = priceResults.find((batch) =>
        batch.contracts.includes(entry.wrapper.contractAddress),
      );
      const priceRaw = priceBatch?.captured ?? {
        status: "UNAVAILABLE" as const,
        value: null,
        reason: "PRICE_BATCH_UNAVAILABLE",
      };
      const price = validatePrice(priceRaw, entry.wrapper.contractAddress);
      const market = validateMarket(marketRaw, entry);

      const ratioFromProfile = positiveScalar(profile.value?.tokenToShareRatio);
      const ratioFromUniverse = positiveScalar(entry.row.tokenToShareRatio);
      const tokenShareRatio = ratioFromProfile ?? ratioFromUniverse;
      const ratioEvidence = ratioFromProfile
        ? evidence("BINANCE_RWA_PROFILE", "AVAILABLE", profile.reason)
        : ratioFromUniverse
          ? evidence(
              "BINANCE_RWA_UNIVERSE",
              "AVAILABLE",
              profile.status === "AVAILABLE"
                ? "PROFILE_RATIO_UNAVAILABLE"
                : "PROFILE_UNAVAILABLE_FALLBACK_USED",
            )
          : evidence(
              "BINANCE_RWA_PROFILE",
              missingEvidenceStatus(profile.status),
              profile.reason ?? "TOKEN_SHARE_RATIO_UNAVAILABLE",
            );
      const directTokenPrice = positiveScalar(price.value?.tokenPrice);
      const universeTokenPrice = positiveScalar(entry.row.tokenPrice);
      const tokenPriceUsd = directTokenPrice ?? universeTokenPrice;
      const tokenPriceEvidence = directTokenPrice
        ? evidence("BINANCE_RWA_PRICE", "AVAILABLE")
        : universeTokenPrice
          ? evidence(
              "BINANCE_RWA_UNIVERSE",
              "AVAILABLE",
              "DIRECT_PRICE_UNAVAILABLE_FALLBACK_USED",
            )
          : evidence(
              "BINANCE_RWA_PRICE",
              missingEvidenceStatus(price.status),
              price.reason ?? "TOKEN_PRICE_UNAVAILABLE",
            );
      const directReference = positiveScalar(price.value?.referencePrice);
      const marketReference = positiveScalar(
        market.value?.marketData?.referencePrice,
      );
      const universeReference = positiveScalar(entry.row.referencePrice);
      const referencePriceUsd =
        directReference ?? marketReference ?? universeReference;
      const referencePriceEvidence = directReference
        ? evidence("BINANCE_RWA_PRICE", "AVAILABLE")
        : marketReference
          ? evidence("BINANCE_UNDERLYING_MARKET", "AVAILABLE")
          : universeReference
            ? evidence(
                "BINANCE_RWA_UNIVERSE",
                "AVAILABLE",
                "DIRECT_REFERENCE_UNAVAILABLE_FALLBACK_USED",
              )
            : evidence(
                "BINANCE_RWA_PRICE",
                missingEvidenceStatus(
                  price.status === "AVAILABLE" ? market.status : price.status,
                ),
                price.reason ?? market.reason ?? "REFERENCE_PRICE_UNAVAILABLE",
              );
      const statusInfo = market.value?.statusInfo ?? entry.row.statusInfo ?? null;
      const marketEvidence = market.value?.statusInfo
        ? evidence("BINANCE_UNDERLYING_MARKET", "AVAILABLE")
        : entry.row.statusInfo
          ? evidence(
              "BINANCE_RWA_UNIVERSE",
              "AVAILABLE",
              "MARKET_ENDPOINT_UNAVAILABLE_FALLBACK_USED",
            )
          : evidence(
              "BINANCE_UNDERLYING_MARKET",
              missingEvidenceStatus(market.status),
              market.reason ?? "MARKET_SESSION_UNAVAILABLE",
            );
      const actionGuard = buildCorporateActionSignal({
        statusInfoAvailable: statusInfo !== null,
        tradingAvailable: statusInfo?.openState ?? null,
        marketStatus: statusInfo?.marketStatus,
        reasonCode: statusInfo?.reasonCode,
        reasonMessage: statusInfo?.reasonMsg,
      });
      const passport = profile.value
        ? buildPassport(entry.wrapper.platform, profile.value)
        : {
            dataCompleteness: "PARTIAL" as const,
            missingFields: [
              "profile",
              "tokenShareRatio",
              "dailyAttestation",
              "monthlyAttestation",
            ],
          };
      const dailyAttestation =
        profile.value?.protections?.dailyAttestationReport?.supported;
      const integrity = buildIntegrity({
        tokenShareRatio: tokenShareRatio ?? undefined,
        referencePrice: referencePriceUsd ?? undefined,
        attestationAvailable:
          dailyAttestation === undefined ? null : dailyAttestation,
      });
      const decimals = parseDecimals(entry.row.decimals);

      return {
        chainId: entry.wrapper.chainId,
        contractAddress: entry.wrapper.contractAddress,
        provider: entry.wrapper.platform,
        wrapperSymbol: entry.wrapper.symbol,
        underlyingIdentity: entry.underlyingIdentity,
        underlyingTicker: entry.underlyingTicker,
        underlyingName: entry.underlyingName,
        decimals,
        tokenShareRatio,
        tokenPriceUsd,
        referencePriceUsd,
        marketSession: statusInfo
          ? {
              tradingAvailable: statusInfo.openState ?? null,
              status: statusInfo.marketStatus ?? null,
              reasonCode: statusInfo.reasonCode ?? null,
              reasonMessage: statusInfo.reasonMsg ?? null,
            }
          : null,
        actionGuard: {
          status: actionGuard.status,
          reason: actionGuard.reason,
        },
        integrity: {
          status: integrity.status,
          dataCompleteness: passport.dataCompleteness as "COMPLETE" | "PARTIAL",
          missingFields: passport.missingFields,
        },
        evidence: {
          identity: evidence("BINANCE_RWA_UNIVERSE", "AVAILABLE"),
          decimals: decimals === null
            ? evidence(
                "BINANCE_RWA_UNIVERSE",
                "UNAVAILABLE",
                "TOKEN_DECIMALS_UNAVAILABLE",
              )
            : evidence("BINANCE_RWA_UNIVERSE", "AVAILABLE"),
          ratio: ratioEvidence,
          tokenPrice: tokenPriceEvidence,
          referencePrice: referencePriceEvidence,
          marketSession: marketEvidence,
          actionGuard: evidence(
            "DERIVED_FROM_RWA_STATUS_INFO",
            statusInfo ? "AVAILABLE" : "UNAVAILABLE",
            actionGuard.reason,
          ),
          integrity: evidence(
            "DERIVED_FROM_PROFILE_AND_PRICE_EVIDENCE",
            integrity.status === "PASS" ? "AVAILABLE" : "UNAVAILABLE",
            integrity.status === "PASS" ? null : "INTEGRITY_EVIDENCE_INCOMPLETE",
          ),
          sources: {
            universe: evidence("BINANCE_RWA_UNIVERSE", "AVAILABLE"),
            price: evidence("BINANCE_RWA_PRICE", price.status, price.reason),
            market: evidence(
              "BINANCE_UNDERLYING_MARKET",
              market.status,
              market.reason,
            ),
            profile: evidence(
              "BINANCE_RWA_PROFILE",
              profile.status,
              profile.reason,
            ),
          },
        },
      } satisfies PortfolioAssetMetadata;
    },
  );
}
