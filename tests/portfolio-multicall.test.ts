import { describe, expect, it, vi } from "vitest";

const { runtimeHashMock } = vi.hoisted(() => ({
  runtimeHashMock: vi.fn(
    () => "2756d7c52baee85cacb504f6ee1df7aad6809ac8d94a4a111d76991f90d36d6e",
  ),
}));

vi.mock("node:crypto", () => ({
  createHash: () => ({
    update: () => ({ digest: () => runtimeHashMock() }),
  }),
}));

import {
  BSC_MULTICALL3_ADDRESS,
  inspectPortfolioSnapshotWithMulticall,
  PORTFOLIO_MULTICALL_CONCURRENCY,
} from "@/lib/portfolio/multicall";
import type { WalletWrapperRef } from "@/lib/wallet/inspector";

const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BLOCK_TAG = "0xabc";

function word(value: bigint | number): string {
  return BigInt(value).toString(16).padStart(64, "0");
}

function padded(value: string): string {
  return value.padEnd(Math.ceil(value.length / 64) * 64, "0");
}

function aggregateResult(
  results: Array<{ success: boolean; data: string }>,
): string {
  const tuples = results.map((result) => {
    const data = result.data.slice(2);
    return `${word(result.success ? 1 : 0)}${word(64)}${word(
      data.length / 2,
    )}${padded(data)}`;
  });
  let offset = results.length * 32;
  const offsets = tuples.map((tuple) => {
    const encoded = word(offset);
    offset += tuple.length / 2;
    return encoded;
  });
  return `0x${word(32)}${word(results.length)}${offsets.join("")}${tuples.join("")}`;
}

function wrapper(index: number): WalletWrapperRef {
  return {
    ticker: `T${index}`,
    name: `Token ${index}`,
    platform: "provider",
    symbol: `T${index}x`,
    contractAddress: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    chainId: "56",
    decimals: 18,
    tokenShareRatio: "1",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("portfolio Multicall3 balance snapshot", () => {
  it("binds aggregate3 to the exact block and preserves each inner result", async () => {
    const wrappers = [wrapper(0), wrapper(1)];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "eth_getCode") {
        expect(request.params).toEqual([BSC_MULTICALL3_ADDRESS, BLOCK_TAG]);
        return jsonResponse({ jsonrpc: "2.0", id: request.id, result: "0x6000" });
      }
      expect(request.method).toBe("eth_call");
      expect(request.params[0].to).toBe(BSC_MULTICALL3_ADDRESS);
      expect(request.params[1]).toBe(BLOCK_TAG);
      expect(request.params[0].data).toMatch(/^0x82ad56cb/);
      expect(request.params[0].data).toContain(wrappers[0].contractAddress.slice(2));
      expect(request.params[0].data).toContain(wrappers[1].contractAddress.slice(2));
      expect(request.params[0].data).toContain("70a08231");
      expect(request.params[0].data).toContain(WALLET.slice(2));
      return jsonResponse({
        jsonrpc: "2.0",
        id: request.id,
        result: aggregateResult([
          { success: true, data: `0x${word(1)}` },
          { success: false, data: "0x" },
        ]),
      });
    });

    const result = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers,
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.state).toBe("PARTIAL");
    expect(result.checks[0]).toMatchObject({
      status: "OK",
      blockTag: BLOCK_TAG,
      rawBalanceHex: `0x${word(1)}`,
      balanceBaseUnits: "1",
      quantity: "0.000000000000000001",
    });
    expect(result.checks[1]).toMatchObject({
      status: "ERROR",
      balanceBaseUnits: null,
      quantity: null,
      error: "Multicall inner balanceOf failed",
    });
    expect(result.multicall).toMatchObject({
      contractCodeVerified: true,
      contractCodeChecks: 1,
      batchCalls: 1,
      batchSize: 100,
    });
  });

  it("keeps a failed batch unknown without affecting successful batches", async () => {
    const wrappers = Array.from({ length: 101 }, (_, index) => wrapper(index));
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "eth_getCode") {
        return jsonResponse({ result: "0x6000" });
      }
      if (request.id === 2) {
        return jsonResponse({
          result: aggregateResult(
            Array.from({ length: 100 }, () => ({
              success: true,
              data: `0x${word(0)}`,
            })),
          ),
        });
      }
      return jsonResponse({ error: { code: -32000, message: "busy" } });
    });

    const result = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers,
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.state).toBe("PARTIAL");
    expect(result.successfulChecks).toBe(100);
    expect(result.failedChecks).toBe(1);
    expect(result.checks[99]).toMatchObject({
      status: "OK",
      balanceBaseUnits: "0",
    });
    expect(result.checks[100]).toMatchObject({
      status: "ERROR",
      balanceBaseUnits: null,
      error: "Multicall balance batch failed",
    });
  });

  it("uses bounded batch concurrency", async () => {
    const wrappers = Array.from({ length: 301 }, (_, index) => wrapper(index));
    let active = 0;
    let maximum = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      if (request.method === "eth_getCode") {
        return jsonResponse({ result: "0x6000" });
      }
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const resultCount = request.id === 5 ? 1 : 100;
      return jsonResponse({
        result: aggregateResult(
          Array.from({ length: resultCount }, () => ({
            success: true,
            data: `0x${word(0)}`,
          })),
        ),
      });
    });

    const result = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers,
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.failedChecks).toBe(0);
    expect(result.multicall.batchCalls).toBe(4);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(PORTFOLIO_MULTICALL_CONCURRENCY);
  });

  it("fails closed on missing contract code or malformed aggregate data", async () => {
    const noCode = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers: [wrapper(0)],
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: vi.fn(async () => jsonResponse({ result: "0x" })) as typeof fetch,
    });
    expect(noCode.state).toBe("UNAVAILABLE");
    expect(noCode.checks[0]).toMatchObject({
      status: "ERROR",
      balanceBaseUnits: null,
      error: "Multicall contract is unavailable at the snapshot block",
    });

    runtimeHashMock.mockReturnValueOnce("0".repeat(64));
    const wrongCode = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers: [wrapper(0)],
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: vi.fn(async () => jsonResponse({ result: "0x6000" })) as typeof fetch,
    });
    expect(wrongCode.state).toBe("UNAVAILABLE");
    expect(wrongCode.checks[0].error).toBe(
      "Multicall contract identity does not match pinned runtime code",
    );

    let call = 0;
    const malformed = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers: [wrapper(0)],
      rpcUrl: "https://rpc.example/secret",
      fetchImpl: vi.fn(async () => {
        call += 1;
        return jsonResponse({ result: call === 1 ? "0x6000" : "0x1234" });
      }) as typeof fetch,
    });
    expect(malformed.state).toBe("UNAVAILABLE");
    expect(malformed.checks[0]).toMatchObject({
      status: "ERROR",
      balanceBaseUnits: null,
      error: "Multicall balance batch failed",
    });
  });

  it("never contacts the network when the RPC URL is unavailable", async () => {
    const fetchMock = vi.fn();
    const result = await inspectPortfolioSnapshotWithMulticall({
      address: WALLET,
      blockTag: BLOCK_TAG,
      wrappers: [wrapper(0)],
      rpcUrl: "",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.checks[0].status).toBe("ERROR");
    expect(result.multicall.contractCodeChecks).toBe(0);
  });
});
