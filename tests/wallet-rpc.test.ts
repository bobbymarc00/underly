import { describe, expect, it, vi } from "vitest";

import {
  createEvmReadOnlyRpc,
  encodeBalanceOf,
  formatBaseUnits,
  isEvmAddress,
  parseDecimals,
  parseHexQuantity,
} from "@/lib/wallet/evm-rpc";

describe("read-only EVM wallet RPC", () => {
  it("validates addresses and encodes ERC-20 balanceOf", () => {
    const address = "0x1111111111111111111111111111111111111111";
    expect(isEvmAddress(address)).toBe(true);
    expect(isEvmAddress("0x1234")).toBe(false);
    expect(encodeBalanceOf(address)).toBe(
      "0x70a082310000000000000000000000001111111111111111111111111111111111111111",
    );
  });

  it("normalizes base units without floating point math", () => {
    expect(formatBaseUnits(1_000_000_000_000_000_000n, 18)).toBe("1");
    expect(formatBaseUnits(1_234_500n, 6)).toBe("1.2345");
    expect(formatBaseUnits(5n, 18)).toBe("0.000000000000000005");
    expect(parseDecimals("18")).toBe(18);
    expect(parseDecimals(undefined)).toBeNull();
    expect(parseHexQuantity("0x10")).toBe(16n);
  });

  it("uses only chainId, blockNumber and eth_call read methods", async () => {
    const seenMethods: string[] = [];
    const seenBodies: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      seenBodies.push(body);
      const method = String(body.method);
      seenMethods.push(method);

      const result =
        method === "eth_chainId"
          ? "0x38"
          : method === "eth_blockNumber"
            ? "0x123"
            : "0xde0b6b3a7640000";

      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const rpc = createEvmReadOnlyRpc("https://rpc.example/secret-key", fetchMock as typeof fetch);
    expect(await rpc.getChainId()).toBe("0x38");
    expect(await rpc.getBlockNumber()).toBe("0x123");
    expect(
      await rpc.getErc20Balance(
        "0x2222222222222222222222222222222222222222",
        "0x1111111111111111111111111111111111111111",
        "0x123",
      ),
    ).toEqual({
      rawHex: "0xde0b6b3a7640000",
      baseUnits: "1000000000000000000",
    });

    expect(seenMethods).toEqual(["eth_chainId", "eth_blockNumber", "eth_call"]);
    expect(seenBodies[2]).toMatchObject({
      method: "eth_call",
      params: [
        {
          to: "0x2222222222222222222222222222222222222222",
          data: encodeBalanceOf("0x1111111111111111111111111111111111111111"),
        },
        "0x123",
      ],
    });
  });

  it("does not leak an RPC URL when transport fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network failed");
    });
    const rpc = createEvmReadOnlyRpc(
      "https://rpc.example/DO-NOT-LEAK",
      fetchMock as typeof fetch,
    );

    await expect(rpc.getChainId()).rejects.toThrow("RPC transport failed");
    await expect(rpc.getChainId()).rejects.not.toThrow("DO-NOT-LEAK");
  });

  it("aborts a timed-out RPC fetch without exposing its URL", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const rpc = createEvmReadOnlyRpc(
      "https://rpc.example/DO-NOT-LEAK",
      fetchMock as typeof fetch,
      { timeoutMs: 5 },
    );

    await expect(rpc.getBlockNumber()).rejects.toThrow("RPC request timed out");
    await expect(rpc.getBlockNumber()).rejects.not.toThrow("DO-NOT-LEAK");
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});
