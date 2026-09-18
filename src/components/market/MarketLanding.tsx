"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { providerLabel } from "@/lib/ui/format";
import type { UniversePayload } from "@/lib/ui/market-types";

import { TerminalHeader } from "./TerminalHeader";
import { TickerSearch } from "./TickerSearch";

export function MarketLanding() {
  const [universe, setUniverse] = useState<UniversePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

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
        setError(
          caught instanceof Error
            ? caught.message
            : "Universe discovery failed",
        );
      });

    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    if (!universe) return [];
    const q = filter.trim().toUpperCase();

    return universe.underlyings
      .filter(
        (item) =>
          !q ||
          item.ticker.includes(q) ||
          item.name.toUpperCase().includes(q) ||
          item.providers.some((provider) =>
            provider.toUpperCase().includes(q),
          ),
      )
      .sort(
        (a, b) =>
          b.wrapperCount - a.wrapperCount ||
          a.ticker.localeCompare(b.ticker),
      );
  }, [filter, universe]);

  return (
    <main className="tm-app">
      <TerminalHeader active="markets" />

      <section className="tm-shell tm-market-intro">
        <div className="tm-eyebrow">TOKENIZED EQUITY MARKET INTELLIGENCE</div>
        <div className="tm-market-intro-grid">
          <div>
            <h1>
              One stock.
              <br />
              Every wrapper.
            </h1>
            <p>
              Inspect tokenized-equity wrappers as a market, not a black-box
              score. Compare source evidence, history, company context and
              wrapper structure without signing a transaction.
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

      <section className="tm-shell tm-stat-strip">
        <div>
          <span>UNDERLYINGS</span>
          <strong>{universe?.summary.underlyingCount ?? "—"}</strong>
        </div>
        <div>
          <span>WRAPPERS</span>
          <strong>{universe?.summary.wrapperCount ?? "—"}</strong>
        </div>
        <div>
          <span>PROVIDERS</span>
          <strong>{universe?.summary.providerCount ?? "—"}</strong>
        </div>
        <div>
          <span>CHAIN</span>
          <strong>{universe ? `BNB ${universe.chainId}` : "BNB"}</strong>
        </div>
        <div className="tm-stat-wide">
          <span>DATA BOUNDARY</span>
          <strong>READ ONLY · EVIDENCE PRESERVING</strong>
        </div>
      </section>

      <section className="tm-shell tm-market-board">
        <div className="tm-section-head">
          <div>
            <span>WRAPPER UNIVERSE</span>
            <h2>Tokenized equities on BNB</h2>
          </div>
          <div className="tm-board-filter">
            <input
              aria-label="Filter market"
              value={filter}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setFilter(event.target.value.toUpperCase())
              }
              placeholder="Filter ticker, company, provider…"
            />
            <span>{rows.length} RESULTS</span>
          </div>
        </div>

        {error && (
          <div className="tm-callout tm-callout-error">
            <span>UNIVERSE UNAVAILABLE</span>
            <strong>{error}</strong>
            <small>No market rows were fabricated.</small>
          </div>
        )}

        {!error && !universe && (
          <div className="tm-board-loading">DISCOVERING WRAPPER UNIVERSE…</div>
        )}

        {universe && (
          <div className="tm-market-table-wrap">
            <table className="tm-market-table">
              <thead>
                <tr>
                  <th>Underlying</th>
                  <th>Company</th>
                  <th>Wrappers</th>
                  <th>Providers</th>
                  <th>Chain</th>
                  <th aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.ticker}>
                    <td>
                      <Link href={`/stock/${encodeURIComponent(item.ticker)}`}>
                        {item.ticker}
                      </Link>
                    </td>
                    <td>{item.name}</td>
                    <td>{item.wrapperCount}</td>
                    <td>
                      <span className="tm-provider-chips">
                        {item.providers.map((provider) => (
                          <em key={provider}>
                            {providerLabel(provider)}
                          </em>
                        ))}
                      </span>
                    </td>
                    <td>BNB {item.wrappers[0]?.chainId ?? universe.chainId}</td>
                    <td>
                      <Link
                        className="tm-row-open"
                        href={`/stock/${encodeURIComponent(item.ticker)}`}
                      >
                        OPEN ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tm-shell tm-boundary-strip">
        <div>
          <span>FROZEN BACKEND</span>
          <strong>v0.2 contracts</strong>
        </div>
        <p>
          Market-history evidence remains available through the read-only API.
          Stock detail prioritizes wrapper intelligence instead of a primary
          historical price chart.
        </p>
        <Link href="/inspect">OPEN V0.1 INSPECTOR ↗</Link>
      </section>
    </main>
  );
}
