import "server-only";

import { createHash } from "node:crypto";

import {
  encodeBalanceOf,
  formatBaseUnits,
  parseHexQuantity,
} from "@/lib/wallet/evm-rpc";
import type {
  WalletBalanceCheck,
  WalletInspectionResult,
  WalletWrapperRef,
} from "@/lib/wallet/inspector";

export const BSC_MULTICALL3_ADDRESS =
  "0xca11bde05977b3631167028862be2a173976ca11";
export const BSC_MULTICALL3_RUNTIME_SHA256 =
  "2756d7c52baee85cacb504f6ee1df7aad6809ac8d94a4a111d76991f90d36d6e";
export const PORTFOLIO_MULTICALL_BATCH_SIZE = 100;
export const PORTFOLIO_MULTICALL_CONCURRENCY = 3;
export const PORTFOLIO_MULTICALL_TIMEOUT_MS = 10_000;

const AGGREGATE3_SELECTOR = "82ad56cb";
const HEX_BYTES = /^0x(?:[0-9a-fA-F]{2})*$/;
const UINT_256_LIMIT = 1n << 256n;

interface JsonRpcEnvelope {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
}

interface AggregateResult {
  success: boolean;
  returnData: string;
}

export interface PortfolioMulticallInspection extends WalletInspectionResult {
  multicall: {
    address: string;
    contractCodeVerified: boolean;
    contractCodeChecks: number;
    batchCalls: number;
    batchSize: number;
    concurrency: number;
    timeoutMs: number;
  };
}

function uintWord(value: bigint): string {
  if (value < 0n || value >= UINT_256_LIMIT) {
    throw new Error("Multicall uint256 is out of range");
  }
  return value.toString(16).padStart(64, "0");
}

function bytes(value: string, label: string): string {
  if (!HEX_BYTES.test(value)) {
    throw new Error(`Multicall returned invalid ${label}`);
  }
  return value.slice(2).toLowerCase();
}

function runtimeCodeHash(value: string): string {
  const normalized = bytes(value, "Multicall3 runtime code");
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}

function paddedBytes(value: string): string {
  const remainder = value.length % 64;
  return remainder === 0 ? value : value.padEnd(value.length + 64 - remainder, "0");
}

function encodeAggregate3(
  wrappers: WalletWrapperRef[],
  walletAddress: string,
): string {
  const callData = bytes(encodeBalanceOf(walletAddress), "balanceOf calldata");
  const tuples = wrappers.map((wrapper) => {
    const target = bytes(wrapper.contractAddress, "wrapper address").padStart(64, "0");
    return [
      target,
      uintWord(1n),
      uintWord(96n),
      uintWord(BigInt(callData.length / 2)),
      paddedBytes(callData),
    ].join("");
  });
  let offset = wrappers.length * 32;
  const offsets = tuples.map((tuple) => {
    const encoded = uintWord(BigInt(offset));
    offset += tuple.length / 2;
    return encoded;
  });

  return `0x${AGGREGATE3_SELECTOR}${uintWord(32n)}${uintWord(
    BigInt(wrappers.length),
  )}${offsets.join("")}${tuples.join("")}`;
}

function readWord(payload: string, byteOffset: number): bigint {
  if (!Number.isSafeInteger(byteOffset) || byteOffset < 0) {
    throw new Error("Multicall response contains an invalid offset");
  }
  const start = byteOffset * 2;
  const end = start + 64;
  if (end > payload.length) {
    throw new Error("Multicall response is truncated");
  }
  return BigInt(`0x${payload.slice(start, end)}`);
}

function safeOffset(value: bigint): number {
  const parsed = safeNumber(value);
  if (parsed % 32 !== 0) {
    throw new Error("Multicall response offset is not word-aligned");
  }
  return parsed;
}

function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Multicall response value is too large");
  }
  return Number(value);
}

function decodeAggregate3(
  value: unknown,
  expectedCount: number,
): AggregateResult[] {
  if (typeof value !== "string") {
    throw new Error("Multicall response is missing result data");
  }
  const payload = bytes(value, "aggregate3 result");
  const outerOffset = safeOffset(readWord(payload, 0));
  const count = safeNumber(readWord(payload, outerOffset));
  if (count !== expectedCount) {
    throw new Error("Multicall result count does not match request");
  }
  const offsetsStart = outerOffset + 32;
  const results: AggregateResult[] = [];

  for (let index = 0; index < count; index += 1) {
    const tupleOffset = safeOffset(readWord(payload, offsetsStart + index * 32));
    const tupleStart = offsetsStart + tupleOffset;
    const successWord = readWord(payload, tupleStart);
    if (successWord !== 0n && successWord !== 1n) {
      throw new Error("Multicall response contains an invalid success flag");
    }
    const returnOffset = safeOffset(readWord(payload, tupleStart + 32));
    const returnStart = tupleStart + returnOffset;
    const returnLength = safeNumber(readWord(payload, returnStart));
    const dataStart = (returnStart + 32) * 2;
    const dataEnd = dataStart + returnLength * 2;
    if (dataEnd > payload.length) {
      throw new Error("Multicall return data is truncated");
    }
    results.push({
      success: successWord === 1n,
      returnData: `0x${payload.slice(dataStart, dataEnd)}`,
    });
  }
  return results;
}

async function rpcRequest(params: {
  rpcUrl: string;
  method: "eth_getCode" | "eth_call";
  rpcParams: unknown[];
  id: number;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(params.signal?.reason);
  if (params.signal?.aborted) {
    abortFromParent();
  } else {
    params.signal?.addEventListener("abort", abortFromParent, { once: true });
  }
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, params.timeoutMs);
  try {
    const response = await params.fetchImpl(params.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: params.id,
        method: params.method,
        params: params.rpcParams,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Multicall RPC returned HTTP ${response.status}`);
    }
    const envelope = (await response.json()) as JsonRpcEnvelope;
    if (envelope.error) {
      throw new Error(
        `Multicall RPC error${
          envelope.error.code === undefined ? "" : ` ${envelope.error.code}`
        }`,
      );
    }
    if (!("result" in envelope)) {
      throw new Error("Multicall RPC response is missing result");
    }
    return envelope.result;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        timedOut ? "Multicall RPC timed out" : "Multicall RPC aborted",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    params.signal?.removeEventListener("abort", abortFromParent);
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
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

function failedCheck(
  wrapper: WalletWrapperRef,
  blockTag: string,
  error: string,
): WalletBalanceCheck {
  return {
    wrapper,
    status: "ERROR",
    blockTag,
    rawBalanceHex: null,
    balanceBaseUnits: null,
    quantity: null,
    error,
  };
}

function successfulCheck(
  wrapper: WalletWrapperRef,
  blockTag: string,
  rawHex: string,
): WalletBalanceCheck {
  const balance = parseHexQuantity(rawHex);
  return {
    wrapper,
    status: "OK",
    blockTag,
    rawBalanceHex: rawHex,
    balanceBaseUnits: balance.toString(10),
    quantity:
      wrapper.decimals === null
        ? null
        : formatBaseUnits(balance, wrapper.decimals),
    error: null,
  };
}

function inspectionResult(params: {
  checks: WalletBalanceCheck[];
  contractCodeVerified: boolean;
  contractCodeChecks: number;
  batchCalls: number;
}): PortfolioMulticallInspection {
  const successfulChecks = params.checks.filter(
    (check) => check.status === "OK",
  ).length;
  const failedChecks = params.checks.length - successfulChecks;
  const holdings = params.checks.flatMap((check) => {
    if (
      check.status !== "OK" ||
      check.rawBalanceHex === null ||
      check.balanceBaseUnits === null ||
      BigInt(check.balanceBaseUnits) === 0n
    ) {
      return [];
    }
    return [
      {
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
      },
    ];
  });
  const state: WalletInspectionResult["state"] =
    failedChecks === 0
      ? "AVAILABLE"
      : successfulChecks === 0 && params.checks.length > 0
        ? "UNAVAILABLE"
        : "PARTIAL";
  return {
    state,
    checks: params.checks,
    holdings,
    successfulChecks,
    failedChecks,
    multicall: {
      address: BSC_MULTICALL3_ADDRESS,
      contractCodeVerified: params.contractCodeVerified,
      contractCodeChecks: params.contractCodeChecks,
      batchCalls: params.batchCalls,
      batchSize: PORTFOLIO_MULTICALL_BATCH_SIZE,
      concurrency: PORTFOLIO_MULTICALL_CONCURRENCY,
      timeoutMs: PORTFOLIO_MULTICALL_TIMEOUT_MS,
    },
  };
}

export async function inspectPortfolioSnapshotWithMulticall(params: {
  address: string;
  blockTag: string;
  wrappers: WalletWrapperRef[];
  rpcUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<PortfolioMulticallInspection> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const failAll = (reason: string, contractCodeChecks = 1) =>
    inspectionResult({
      checks: params.wrappers.map((wrapper) =>
        failedCheck(wrapper, params.blockTag, reason),
      ),
      contractCodeVerified: false,
      contractCodeChecks,
      batchCalls: 0,
    });
  if (!params.rpcUrl.trim()) {
    return failAll("Portfolio multicall RPC is not configured", 0);
  }
  if (params.wrappers.length === 0) {
    return inspectionResult({
      checks: [],
      contractCodeVerified: true,
      contractCodeChecks: 0,
      batchCalls: 0,
    });
  }

  let code: unknown;
  try {
    code = await rpcRequest({
      rpcUrl: params.rpcUrl,
      method: "eth_getCode",
      rpcParams: [BSC_MULTICALL3_ADDRESS, params.blockTag],
      id: 1,
      fetchImpl,
      timeoutMs: PORTFOLIO_MULTICALL_TIMEOUT_MS,
      signal: params.signal,
    });
  } catch {
    return failAll("Multicall contract verification failed");
  }
  if (typeof code !== "string" || !HEX_BYTES.test(code) || code === "0x") {
    return failAll("Multicall contract is unavailable at the snapshot block");
  }
  if (runtimeCodeHash(code) !== BSC_MULTICALL3_RUNTIME_SHA256) {
    return failAll("Multicall contract identity does not match pinned runtime code");
  }

  const batches = chunks(params.wrappers, PORTFOLIO_MULTICALL_BATCH_SIZE);
  const batchResults = await mapWithConcurrency(
    batches,
    PORTFOLIO_MULTICALL_CONCURRENCY,
    async (batch, batchIndex): Promise<WalletBalanceCheck[]> => {
      try {
        const result = await rpcRequest({
          rpcUrl: params.rpcUrl,
          method: "eth_call",
          rpcParams: [
            {
              to: BSC_MULTICALL3_ADDRESS,
              data: encodeAggregate3(batch, params.address),
            },
            params.blockTag,
          ],
          id: batchIndex + 2,
          fetchImpl,
          timeoutMs: PORTFOLIO_MULTICALL_TIMEOUT_MS,
          signal: params.signal,
        });
        const decoded = decodeAggregate3(result, batch.length);
        return decoded.map((item, index) => {
          const wrapper = batch[index];
          if (!item.success) {
            return failedCheck(
              wrapper,
              params.blockTag,
              "Multicall inner balanceOf failed",
            );
          }
          if (!/^0x[0-9a-fA-F]{64}$/.test(item.returnData)) {
            return failedCheck(
              wrapper,
              params.blockTag,
              "Multicall returned invalid balanceOf data",
            );
          }
          return successfulCheck(
            wrapper,
            params.blockTag,
            item.returnData.toLowerCase(),
          );
        });
      } catch {
        return batch.map((wrapper) =>
          failedCheck(
            wrapper,
            params.blockTag,
            "Multicall balance batch failed",
          ),
        );
      }
    },
  );

  return inspectionResult({
    checks: batchResults.flat(),
    contractCodeVerified: true,
    contractCodeChecks: 1,
    batchCalls: batches.length,
  });
}
