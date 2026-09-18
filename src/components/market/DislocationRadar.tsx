"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatUsd, providerLabel } from "@/lib/ui/format";

interface RadarWrapper {
  provider: string;
  symbol: string;
  contractAddress: string;
  tokenShareRatio: string;
  tokenPriceUsd: string;
  referencePriceUsd: string;
  shareEquivalentPriceUsd: string;
  referenceGapPct: string;
  tradingAvailable: boolean | null;
  marketStatus: string | null;
  nextOpenAt: number | null;
}

interface RadarItem {
  ticker: string;
  name: string;
  chainId: string;
  sessionState: "OPEN" | "CLOSED" | "MIXED" | "UNKNOWN";
  providers: string[];
  wrapperCount: number;
  evidenceStatus: "MULTI_WRAPPER" | "SINGLE_SOURCE";
  maxAbsoluteGapPct: string;
  gapSpreadPctPoints: string;
  wrappers: RadarWrapper[];
}

interface RadarPayload {
  version: string;
  generatedAt: string;
  chainId: string;
  status: "AVAILABLE" | "EMPTY";
  items: RadarItem[];
  error?: string;
}

function signedPct(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${parsed.toFixed(Math.abs(parsed) < 1 ? 3 : 2)}%`;
}

function sessionLabel(value: RadarItem["sessionState"]): string {
  if (value === "CLOSED") return "UNDERLYING CLOSED";
  if (value === "OPEN") return "UNDERLYING OPEN";
  if (value === "MIXED") return "SESSION MIXED";
  return "SESSION UNKNOWN";
}

export function DislocationRadar() {
  const [payload, setPayload] = useState<RadarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/dislocations?session=all&limit=6", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as RadarPayload;
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setPayload)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Reference dislocation discovery failed",
        );
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="tm-shell tm-dislocation-radar">
      <div className="tm-section-head tm-section-head-tight">
        <div>
          <span>UNDERLY v0.3 · ECONOMIC NORMALIZATION</span>
          <h2>Reference dislocations</h2>
        </div>
        <p className="tm-snapshot-note">
          Ratio-adjusted wrapper price vs current underlying reference.
          Closed-market observations appear first · evidence only.
        </p>
      </div>

      {!payload && !error && (
        <div className="tm-board-loading">
          NORMALIZING BSC TOKENIZED-EQUITY REPRESENTATIONS…
        </div>
      )}

      {error && (
        <div className="tm-callout tm-callout-error">
          <span>DISLOCATION RADAR UNAVAILABLE</span>
          <strong>{error}</strong>
          <small>No reference gap was fabricated.</small>
        </div>
      )}

      {payload?.status === "EMPTY" && (
        <div className="tm-market-card-empty">
          <span>NO COMPARABLE SNAPSHOT</span>
          <strong>
            No wrapper currently has complete token price, reference price,
            and token/share-ratio evidence.
          </strong>
        </div>
      )}

      {payload && payload.items.length > 0 && (
        <div className="tm-dislocation-grid">
          {payload.items.map((item, index) => {
            const lead = item.wrappers[0];

            return (
              <Link
                href={`/stock/${encodeURIComponent(item.ticker)}`}
                className={`tm-dislocation-card ${index === 0 ? "tm-dislocation-card-featured" : ""}`}
                key={item.ticker}
              >
                <div className="tm-dislocation-card-head">
                  <span data-session={item.sessionState}>
                    {sessionLabel(item.sessionState)}
                  </span>
                  <em>OPEN ↗</em>
                </div>

                <div className="tm-dislocation-title">
                  <strong>{item.ticker}</strong>
                  <p>{item.name}</p>
                </div>

                <div className="tm-dislocation-signal">
                  <span>MAX CURRENT GAP</span>
                  <strong>{signedPct(item.maxAbsoluteGapPct)}</strong>
                  <small>
                    {item.evidenceStatus === "MULTI_WRAPPER"
                      ? `${item.wrapperCount} WRAPPERS · GAP SPREAD ${signedPct(item.gapSpreadPctPoints)}`
                      : "SINGLE WRAPPER EVIDENCE"}
                  </small>
                </div>

                {lead && (
                  <div className="tm-dislocation-lead">
                    <div>
                      <span>LEAD WRAPPER</span>
                      <strong>
                        {providerLabel(lead.provider)} · {lead.symbol}
                      </strong>
                    </div>
                    <div>
                      <span>SHARE-EQUIV PRICE</span>
                      <strong>{formatUsd(lead.shareEquivalentPriceUsd)}</strong>
                    </div>
                    <div>
                      <span>REFERENCE</span>
                      <strong>{formatUsd(lead.referencePriceUsd)}</strong>
                    </div>
                  </div>
                )}

                <div className="tm-dislocation-provider-row">
                  {item.providers.map((provider) => (
                    <span key={provider}>{providerLabel(provider)}</span>
                  ))}
                  <small>BNB {item.chainId}</small>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="tm-dislocation-method">
        <strong>CURRENT SNAPSHOT ONLY</strong>
        <p>
          Underly divides wrapper token price by the verified current
          token/share ratio before comparing it with reference price. The
          current ratio is never projected backward into historical candles.
        </p>
      </div>
    </section>
  );
}
