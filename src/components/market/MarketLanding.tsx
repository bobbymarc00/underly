"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { providerLabel } from "@/lib/ui/format";
import type { UniversePayload } from "@/lib/ui/market-types";

import { DislocationRadar } from "./DislocationRadar";
import { TerminalHeader } from "./TerminalHeader";
import { TickerSearch } from "./TickerSearch";

type RankingTab = "hot" | "gainers" | "losers";
type RankingTone = "hot" | "gainer" | "loser";

interface RankedUnderlying {
  ticker: string;
  name: string;
  wrapperCount: number;
  providers: string[];
  chainId: string | null;
  reportedVolume24H: number | null;
  priceChangePct24H: number | null;
  referencePriceUsd: number | null;
  moverEvidence: {
    status:
      | "CONSENSUS"
      | "SINGLE_SOURCE"
      | "REJECTED"
      | "UNAVAILABLE"
      | null;
    wrapperSamples: number;
    spreadPctPoints: number | null;
  };
}

interface LandingRankingsPayload {
  version: string;
  scope: "hot" | "movers";
  generatedAt: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  note?: string;
  sample: {
    universeCount: number;
    volumeRanked: number;
    moverCandidates: number;
    moversScanned: number;
    moversRejected: number;
  };
  categories: {
    hot: RankedUnderlying[];
    gainers: RankedUnderlying[];
    losers: RankedUnderlying[];
  };
  error?: string;
}

const TILE_LIMIT = 6;

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "â€”";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 2 : 4,
  }).format(value);
}

function formatCompactNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "â€”";

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "â€”";

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function rankingValue(
  item: RankedUnderlying,
  tone: RankingTone,
): string {
  if (tone === "hot") {
    return formatCompactNumber(item.reportedVolume24H);
  }

  return formatPct(item.priceChangePct24H);
}

function rankingSubLabel(tone: RankingTone): string {
  return tone === "hot" ? "REPORTED 24H VOL" : "24H CHANGE";
}

function toneForTab(tab: RankingTab): RankingTone {
  if (tab === "gainers") return "gainer";
  if (tab === "losers") return "loser";
  return "hot";
}

function tabTitle(tab: RankingTab): string {
  if (tab === "gainers") return "Gainers";
  if (tab === "losers") return "Losers";
  return "Hot";
}

function tabDescription(tab: RankingTab): string {
  if (tab === "gainers") {
    return "Largest positive 24-hour moves with cross-wrapper evidence.";
  }
  if (tab === "losers") {
    return "Largest negative 24-hour moves with cross-wrapper evidence.";
  }
  return "Most active underlyings by reported 24-hour trade volume.";
}

export function MarketLanding() {
  const [universe, setUniverse] =
    useState<UniversePayload | null>(null);
  const [universeError, setUniverseError] =
    useState<string | null>(null);

  const [hotRankings, setHotRankings] =
    useState<LandingRankingsPayload | null>(null);
  const [hotError, setHotError] =
    useState<string | null>(null);

  const [moverRankings, setMoverRankings] =
    useState<LandingRankingsPayload | null>(null);
  const [moverError, setMoverError] =
    useState<string | null>(null);

  const [activeTab, setActiveTab] =
    useState<RankingTab>("hot");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/universe", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as UniversePayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setUniverse)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setUniverseError(
          caught instanceof Error
            ? caught.message
            : "Universe discovery failed",
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/landing-rankings?scope=hot&limit=${TILE_LIMIT}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body =
          (await response.json()) as LandingRankingsPayload;
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setHotRankings)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setHotError(
          caught instanceof Error
            ? caught.message
            : "HOT ranking unavailable",
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (
      activeTab === "hot" ||
      moverRankings ||
      moverError
    ) {
      return;
    }

    const controller = new AbortController();

    fetch(`/api/landing-rankings?scope=movers&limit=${TILE_LIMIT}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body =
          (await response.json()) as LandingRankingsPayload;
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setMoverRankings)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setMoverError(
          caught instanceof Error
            ? caught.message
            : "Mover rankings unavailable",
        );
      });

    return () => controller.abort();
  }, [activeTab, moverError, moverRankings]);

  const snapshot = useMemo(() => {
    if (!universe) {
      return {
        multiWrapperCount: null,
        densestWrapperCount: null,
        densestTickers: "â€”",
      };
    }

    const multiWrapperCount = universe.underlyings.filter(
      (item) => item.wrapperCount > 1,
    ).length;
    const densestWrapperCount = universe.underlyings.reduce(
      (max, item) => Math.max(max, item.wrapperCount),
      0,
    );
    const densestTickers =
      universe.underlyings
        .filter(
          (item) =>
            item.wrapperCount === densestWrapperCount,
        )
        .slice(0, 3)
        .map((item) => item.ticker)
        .join(" Â· ") || "â€”";

    return {
      multiWrapperCount,
      densestWrapperCount,
      densestTickers,
    };
  }, [universe]);

  const tone = toneForTab(activeTab);
  const activeItems =
    activeTab === "hot"
      ? hotRankings?.categories.hot ?? []
      : activeTab === "gainers"
        ? moverRankings?.categories.gainers ?? []
        : moverRankings?.categories.losers ?? [];

  const activeError =
    activeTab === "hot" ? hotError : moverError;

  const activeLoading =
    activeTab === "hot"
      ? !hotRankings && !hotError
      : !moverRankings && !moverError;

  return (
    <main className="tm-app">
      <TerminalHeader active="markets" />

      <section className="tm-shell tm-market-intro">
        <div className="tm-eyebrow">
          TOKENIZED EQUITY MARKET INTELLIGENCE
        </div>
        <div className="tm-market-intro-grid">
          <div>
            <h1>
              One stock.
              <br />
              Every wrapper.
            </h1>
            <p>
              Inspect tokenized-equity wrappers as a market,
              not a black-box score. Compare source evidence,
              history, company context and wrapper structure
              without signing a transaction.
            </p>
          </div>
          <div className="tm-hero-search">
            <span>OPEN AN UNDERLYING</span>
            <TickerSearch />
            <small>
              Search resolves the live Binance Web3 RWA universe.
            </small>
          </div>
        </div>
      </section>

      <section className="tm-shell tm-market-snapshot">
        <div className="tm-section-head tm-section-head-tight">
          <div>
            <span>LIVE UNIVERSE</span>
            <h2>Market snapshot</h2>
          </div>
          <p className="tm-snapshot-note">
            Coverage signals only Â· not price momentum
            or a wrapper ranking.
          </p>
        </div>

        {universeError && (
          <div className="tm-callout tm-callout-error">
            <span>UNIVERSE UNAVAILABLE</span>
            <strong>{universeError}</strong>
            <small>
              No market snapshot values were fabricated.
            </small>
          </div>
        )}

        <div className="tm-snapshot-grid">
          <article className="tm-snapshot-card tm-snapshot-card-hero">
            <span>UNIVERSE COVERAGE</span>
            <strong>
              {universe?.summary.underlyingCount ?? "â€”"}
            </strong>
            <p>
              tokenized-equity underlyings discovered
              from the live RWA universe
            </p>
            <em>
              BNB {universe?.chainId ?? "â€”"} Â· READ ONLY
            </em>
          </article>

          <article className="tm-snapshot-card tm-snapshot-card-accent">
            <span>MULTI-WRAPPER</span>
            <strong>
              {snapshot.multiWrapperCount ?? "â€”"}
            </strong>
            <p>
              underlyings with more than one wrapper contract
            </p>
          </article>

          <article className="tm-snapshot-card tm-snapshot-card-cyan">
            <span>WRAPPER CONTRACTS</span>
            <strong>
              {universe?.summary.wrapperCount ?? "â€”"}
            </strong>
            <p>
              provider-specific wrappers visible to Underly
            </p>
          </article>

          <article className="tm-snapshot-card tm-snapshot-card-orange">
            <span>PROVIDERS</span>
            <strong>
              {universe?.summary.providerCount ?? "â€”"}
            </strong>
            <p>
              provider namespaces represented in the current universe
            </p>
          </article>

          <article className="tm-snapshot-card tm-snapshot-card-wide">
            <span>DENSEST COVERAGE</span>
            <strong>
              {snapshot.densestWrapperCount === null
                ? "â€”"
                : `${snapshot.densestWrapperCount} wrappers`}
            </strong>
            <p>{snapshot.densestTickers}</p>
            <em>
              coverage density Â· not a performance signal
            </em>
          </article>
        </div>
      </section>

      <section className="tm-shell tm-market-tab-board" data-tone={tone}>
        <div className="tm-section-head tm-section-head-tight">
          <div>
            <span>MARKET SPOTLIGHT</span>
            <h2>{tabTitle(activeTab)}</h2>
          </div>
          <p className="tm-snapshot-note">
            {tabDescription(activeTab)}
          </p>
        </div>

        <div
          className="tm-market-tabs"
          role="tablist"
          aria-label="Market spotlight"
        >
          {(["hot", "gainers", "losers"] as RankingTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                data-active={activeTab === tab}
                className={`tm-market-tab tm-market-tab-${toneForTab(tab)}`}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tabTitle(tab)}</span>
                <small>
                  {tab === "hot"
                    ? "VOLUME"
                    : tab === "gainers"
                      ? "24H +"
                      : "24H âˆ’"}
                </small>
              </button>
            ),
          )}
        </div>

        {activeLoading && (
          <div className="tm-board-loading">
            {activeTab === "hot"
              ? "LOADING HOT MARKET SIGNALSâ€¦"
              : "LOADING CROSS-WRAPPER MOVERSâ€¦"}
          </div>
        )}

        {activeError && (
          <div className="tm-callout tm-callout-error">
            <span>MARKET SIGNAL UNAVAILABLE</span>
            <strong>{activeError}</strong>
            <small>No ranking tile was fabricated.</small>
          </div>
        )}

        {!activeLoading &&
          !activeError &&
          activeItems.length === 0 && (
            <div className="tm-market-card-empty">
              <span>NO LIVE SIGNAL</span>
              <strong>
                No {tabTitle(activeTab).toLowerCase()} signal is
                available right now.
              </strong>
            </div>
          )}

        {!activeLoading &&
          !activeError &&
          activeItems.length > 0 && (
            <>
              <div
                className={`tm-market-tab-grid tm-market-tab-grid-${tone}`}
                role="tabpanel"
              >
                {activeItems.map((item, index) => {
                  const tileClass = [
                    "tm-market-tab-tile",
                    `tm-market-tab-tile-${tone}`,
                    index === 0
                      ? "tm-market-tab-tile-featured"
                      : "",
                    index === 3
                      ? "tm-market-tab-tile-wide"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <Link
                      className={tileClass}
                      href={`/stock/${encodeURIComponent(
                        item.ticker,
                      )}`}
                      key={`${activeTab}-${item.ticker}`}
                    >
                      <div className="tm-market-tab-tile-head">
                        <span>
                          {activeTab.toUpperCase()}{" "}
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <em>OPEN â†—</em>
                      </div>

                      <div className="tm-market-tab-tile-main">
                        <strong>{item.ticker}</strong>
                        <p>{item.name}</p>
                      </div>

                      <div className="tm-market-tab-signal">
                        <span>{rankingSubLabel(tone)}</span>
                        <strong>
                          {rankingValue(item, tone)}
                        </strong>
                        {tone !== "hot" &&
                          item.moverEvidence.status && (
                            <small>
                              {item.moverEvidence.status ===
                              "CONSENSUS"
                                ? `CONSENSUS Â· ${item.moverEvidence.wrapperSamples} WRAPPERS`
                                : item.moverEvidence.status ===
                                    "SINGLE_SOURCE"
                                  ? "SINGLE SOURCE"
                                  : item.moverEvidence.status}
                            </small>
                          )}
                      </div>

                      <div className="tm-market-tab-meta">
                        <div>
                          <span>REFERENCE PRICE</span>
                          <strong>
                            {formatUsd(item.referencePriceUsd)}
                          </strong>
                        </div>
                        <div>
                          <span>WRAPPERS</span>
                          <strong>{item.wrapperCount}</strong>
                        </div>
                      </div>

                      <div className="tm-market-tab-tile-foot">
                        <span className="tm-provider-chips">
                          {item.providers.map(
                            (provider) => (
                              <em key={provider}>
                                {providerLabel(provider)}
                              </em>
                            ),
                          )}
                        </span>
                        <small>
                          BNB{" "}
                          {item.chainId ??
                            universe?.chainId ??
                            "â€”"}
                        </small>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="tm-market-card-caption">
                <span>
                  {activeTab === "hot"
                    ? `VOLUME-RANKED ${hotRankings?.sample.volumeRanked ?? "â€”"}`
                    : `MOVERS ${moverRankings?.sample.moversScanned ?? "â€”"}/${moverRankings?.sample.moverCandidates ?? "â€”"} Â· REJECTED ${moverRankings?.sample.moversRejected ?? "â€”"}`}
                </span>
                <p>
                  {activeTab === "hot"
                    ? "HOT is the default landing view and requires no mover candle fan-out."
                    : "Mover data is requested only after opening Gainers or Losers. Conflicting multi-wrapper returns are excluded."}
                </p>
              </div>
            </>
          )}
      </section>

      <DislocationRadar />

      <section className="tm-shell tm-boundary-strip">
        <div>
          <span>FROZEN BACKEND</span>
          <strong>v0.2 contracts</strong>
        </div>
        <p>
          Market-history evidence remains available through
          the read-only API. Stock detail prioritizes wrapper
          intelligence instead of a primary historical price chart.
        </p>
        <Link href="/inspect">
          OPEN V0.1 INSPECTOR â†—
        </Link>
      </section>
    </main>
  );
}
