import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BinanceRequestAbortedError,
  binanceSignedGet,
} from "@/lib/binance/client";

function configureAuth() {
  vi.stubEnv("BINANCE_WEB3_API_KEY", "test-key");
  vi.stubEnv("BINANCE_WEB3_SECRET", "test-secret");
}

describe("Binance transport reliability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("aborts the underlying fetch when the operation timeout expires", async () => {
    configureAuth();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const result = binanceSignedGet("/api/test", {}, { timeoutMs: 5 });

    await expect(result).rejects.toMatchObject({
      name: "BinanceRequestAbortedError",
      reason: "TIMEOUT",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("cancels a 429 retry backoff without issuing another request", async () => {
    configureAuth();
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 42900, msg: "limited", data: null }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "10",
        },
      }),
    );

    const result = binanceSignedGet("/api/test", {}, {
      signal: controller.signal,
      timeoutMs: 20_000,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<BinanceRequestAbortedError>>({
        reason: "ABORTED",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the actual HTTP attempt count across a bounded retry", async () => {
    configureAuth();
    const onAttempt = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 42900, msg: "limited", data: null }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "0",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 0, msg: "ok", data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await binanceSignedGet<unknown[]>("/api/test", {}, {
      timeoutMs: 1_000,
      onAttempt,
    });

    expect(response.code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });
});
