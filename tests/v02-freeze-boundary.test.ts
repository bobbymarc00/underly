import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function repoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("v0.2 freeze boundary", () => {
  it("keeps Binance aggregator integration quote-only", () => {
    const source = repoFile("src/lib/binance/trading.ts");

    expect(source).toContain("binanceSignedGet");
    expect(source).toContain("/api/v1/dex/aggregator/quote");

    for (const prohibited of [
      "binanceSignedPost",
      "/api/v1/dex/aggregator/swap",
      "/api/v1/dex/aggregator/execute",
      "sendTransaction",
      "signTransaction",
    ]) {
      expect(source).not.toContain(prohibited);
    }
  });

  it("keeps wallet RPC free of transaction/signature methods", () => {
    const source = repoFile("src/lib/wallet/evm-rpc.ts");

    expect(source).toContain('"eth_chainId"');
    expect(source).toContain('"eth_blockNumber"');
    expect(source).toContain('"eth_call"');

    for (const prohibited of [
      "eth_sendTransaction",
      "eth_sendRawTransaction",
      "eth_signTransaction",
      "personal_sign",
      '"eth_sign"',
      "wallet_sendCalls",
      "wallet_sendTransaction",
    ]) {
      expect(source).not.toContain(prohibited);
    }
  });

  it("keeps secret-bearing environment examples as blank placeholders", () => {
    const env = repoFile(".env.example");
    const values = new Map(
      env
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)] as const;
        }),
    );

    for (const key of [
      "BINANCE_WEB3_API_KEY",
      "BINANCE_WEB3_SECRET",
      "UNDERLY_QUOTE_WALLET",
      "UNDERLY_NEWS_PROVIDER",
      "ALPHAVANTAGE_API_KEY",
      "UNDERLY_RPC_URL",
    ]) {
      expect(values.get(key)).toBe("");
    }

    expect(values.get("UNDERLY_CHAIN_ID")).toBe("56");
  });

  it("keeps local secrets and installer backups gitignored", () => {
    const gitignore = repoFile(".gitignore");

    expect(gitignore).toContain(".env.local");
    expect(gitignore).toContain(".env.*.local");
    expect(gitignore).toContain(".underly-patch-backups");
    expect(gitignore).toContain("*.v*-backup-*");
  });

  it("pins historical share-adjusted mode as deferred instead of approximated", () => {
    const route = repoFile("src/app/api/market-history/route.ts");
    const verification = repoFile("docs/TOKEN_SHARE_RATIO_VERIFICATION.md");

    expect(route).toContain('supportedModes: ["raw", "indexed100"]');
    expect(route).toContain("shareAdjusted: false");
    expect(verification).toContain(
      "Historical ratio continuity is not yet verified",
    );
  });
});
