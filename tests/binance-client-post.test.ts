import { afterEach, describe, expect, it, vi } from "vitest";

import { binanceSignedPost } from "../src/lib/binance/client";

describe("Binance signed POST transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("signs and sends the exact JSON body used by Transaction API", async () => {
    vi.stubEnv("BINANCE_WEB3_API_KEY", "test-key");
    vi.stubEnv("BINANCE_WEB3_SECRET", "test-secret");

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ code: 0, msg: "success", data: { status: "SUCCESS" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const body = {
      binanceChainId: "56",
      evmTx: {
        from: "0x1111111111111111111111111111111111111111",
        to: "0x2222222222222222222222222222222222222222",
        value: "0",
        data: "0x1234",
      },
    };

    const result = await binanceSignedPost<{ status: string }>(
      "/api/v1/dex/pre-transaction/simulate",
      body,
    );

    expect(result.code).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://web3.binance.com/build/api/v1/dex/pre-transaction/simulate",
    );
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(init?.headers).toMatchObject({
      "X-OC-APIKEY": "test-key",
      "Content-Type": "application/json",
    });
  });
});
