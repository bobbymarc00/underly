import "server-only";
import crypto from "node:crypto";

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function timestampIso(): string {
  return new Date().toISOString();
}

export function signBinanceRequest(params: {
  timestamp: string;
  method: string;
  requestPath: string;
  body?: string;
}): string {
  const secret = requiredEnv("BINANCE_WEB3_SECRET");
  const prehash = `${params.timestamp}${params.method.toUpperCase()}${params.requestPath}${params.body ?? ""}`;
  return crypto.createHmac("sha256", secret).update(prehash, "utf8").digest("base64");
}

export function encodeQuery(entries: Record<string, string | number | boolean | undefined>): string {
  return Object.entries(entries)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}
