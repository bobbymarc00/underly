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

export class BinanceRequestAbortedError extends BinanceTransportError {
  constructor(readonly reason: "TIMEOUT" | "ABORTED") {
    super(
      reason === "TIMEOUT"
        ? "Binance request timed out"
        : "Binance request was aborted",
    );
    this.name = "BinanceRequestAbortedError";
  }
}

export interface BinanceRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onAttempt?: () => void;
}

function requestControl(options: BinanceRequestOptions) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(options.signal?.reason);

  if (options.signal?.aborted) {
    abortFromParent();
  } else {
    options.signal?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs);

  return {
    signal: controller.signal,
    abortedError: () =>
      new BinanceRequestAbortedError(timedOut ? "TIMEOUT" : "ABORTED"),
    dispose: () => {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    },
  };
}

function sleep(
  ms: number,
  signal: AbortSignal,
  abortedError: () => BinanceRequestAbortedError,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortedError());
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(abortedError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
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
  options: BinanceRequestOptions = {},
): Promise<BinanceEnvelope<T>> {
  const qs = encodeQuery(query);
  const pathWithQuery = `${apiPath}${qs ? `?${qs}` : ""}`;
  const signedPath = `${BUILD_PREFIX}${pathWithQuery}`;
  const control = requestControl(options);

  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const timestamp = timestampIso();
      const signature = signBinanceRequest({
        timestamp,
        method: "GET",
        requestPath: signedPath,
      });

      options.onAttempt?.();
      let response: Response;
      try {
        response = await fetch(`${ORIGIN}${signedPath}`, {
          method: "GET",
          headers: {
            "X-OC-APIKEY": requiredEnv("BINANCE_WEB3_API_KEY"),
            "X-OC-TIMESTAMP": timestamp,
            "X-OC-SIGN": signature,
            "X-OC-RECV-WINDOW": "60000",
            Accept: "application/json",
          },
          cache: "no-store",
          signal: control.signal,
        });
      } catch (error) {
        if (control.signal.aborted) throw control.abortedError();
        throw error;
      }

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
      await sleep(
        retryDelayMs(response, attempt),
        control.signal,
        control.abortedError,
      );
    }

    throw new BinanceTransportError("Unexpected Binance retry state");
  } finally {
    control.dispose();
  }
}
export async function binanceSignedPost<T>(
  apiPath: string,
  body: unknown,
  options: BinanceRequestOptions = {},
): Promise<BinanceEnvelope<T>> {
  const signedPath = `${BUILD_PREFIX}${apiPath}`;
  const bodyText = JSON.stringify(body);
  const control = requestControl(options);

  try {
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      const timestamp = timestampIso();
      const signature = signBinanceRequest({
        timestamp,
        method: "POST",
        requestPath: signedPath,
        body: bodyText,
      });

      options.onAttempt?.();
      let response: Response;
      try {
        response = await fetch(`${ORIGIN}${signedPath}`, {
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
          signal: control.signal,
        });
      } catch (error) {
        if (control.signal.aborted) throw control.abortedError();
        throw error;
      }

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
      await sleep(
        retryDelayMs(response, attempt),
        control.signal,
        control.abortedError,
      );
    }

    throw new BinanceTransportError("Unexpected Binance retry state");
  } finally {
    control.dispose();
  }
}
