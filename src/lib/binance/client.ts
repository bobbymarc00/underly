import "server-only";
import { encodeQuery, requiredEnv, signBinanceRequest, timestampIso } from "./auth";

const ORIGIN = "https://web3.binance.com";
const BUILD_PREFIX = "/build";
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 10_000;

export interface BinanceEnvelope<T> {
  code: number;
  msg: string;
  data: T;
  timestamp?: number;
  success?: boolean;
}

export class BinanceTransportError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
    }
    const retryDate = Date.parse(retryAfter);
    if (Number.isFinite(retryDate)) {
      return Math.min(Math.max(retryDate - Date.now(), 0), MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(300 * 2 ** attempt, 2_000);
}

export async function binanceSignedGet<T>(
  apiPath: string,
  query: Record<string, string | number | boolean | undefined> = {},
): Promise<BinanceEnvelope<T>> {
  const qs = encodeQuery(query);
  const pathWithQuery = `${apiPath}${qs ? `?${qs}` : ""}`;
  const signedPath = `${BUILD_PREFIX}${pathWithQuery}`;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const timestamp = timestampIso();
    const signature = signBinanceRequest({
      timestamp,
      method: "GET",
      requestPath: signedPath,
    });

    const response = await fetch(`${ORIGIN}${signedPath}`, {
      method: "GET",
      headers: {
        "X-OC-APIKEY": requiredEnv("BINANCE_WEB3_API_KEY"),
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "X-OC-RECV-WINDOW": "60000",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    let payload: BinanceEnvelope<T>;
    try {
      payload = (await response.json()) as BinanceEnvelope<T>;
    } catch {
      throw new BinanceTransportError(`Binance returned non-JSON HTTP ${response.status}`);
    }

    if (payload.code !== 42900) return payload;
    if (attempt === MAX_RATE_LIMIT_RETRIES) return payload;
    await sleep(retryDelayMs(response, attempt));
  }

  throw new BinanceTransportError("Unexpected Binance retry state");
}
export async function binanceSignedPost<T>(
  apiPath: string,
  body: unknown,
): Promise<BinanceEnvelope<T>> {
  const signedPath = `${BUILD_PREFIX}${apiPath}`;
  const bodyText = JSON.stringify(body);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const timestamp = timestampIso();
    const signature = signBinanceRequest({
      timestamp,
      method: "POST",
      requestPath: signedPath,
      body: bodyText,
    });

    const response = await fetch(`${ORIGIN}${signedPath}`, {
      method: "POST",
      headers: {
        "X-OC-APIKEY": requiredEnv("BINANCE_WEB3_API_KEY"),
        "X-OC-TIMESTAMP": timestamp,
        "X-OC-SIGN": signature,
        "X-OC-RECV-WINDOW": "60000",
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: bodyText,
      cache: "no-store",
    });

    let payload: BinanceEnvelope<T>;
    try {
      payload = (await response.json()) as BinanceEnvelope<T>;
    } catch {
      throw new BinanceTransportError(
        `Binance returned non-JSON HTTP ${response.status}`,
      );
    }

    if (payload.code !== 42900) return payload;
    if (attempt === MAX_RATE_LIMIT_RETRIES) return payload;
    await sleep(retryDelayMs(response, attempt));
  }

  throw new BinanceTransportError("Unexpected Binance retry state");
}
