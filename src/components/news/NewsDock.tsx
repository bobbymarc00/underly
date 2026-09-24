"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import styles from "./NewsDock.module.css";

interface TickerEvidence {
  ticker: string;
  relevanceScore: string | null;
  sentimentScore: string | null;
  sentimentLabel: string | null;
}

interface NewsItem {
  headline: string;
  source: string;
  publishedAt: string;
  url: string;
  topics: string[];
  relatedTickers: TickerEvidence[];
}

type NewsReasonCode =
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE";

interface NewsPayload {
  scope: "market" | "ticker";
  ticker: string | null;
  status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";
  provider: string | null;
  items: NewsItem[];
  note?: string;
  reasonCode?: NewsReasonCode;
}

function detailTicker(pathname: string): string | null {
  const match = pathname.match(
    /^\/(?:stock|stocks|asset|equity)\/([^/]+)\/?$/i,
  );

  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

function formatPublishedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function uniqueTickerEvidence(items: TickerEvidence[]): TickerEvidence[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const ticker = item.ticker.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) return false;
    seen.add(ticker);
    return true;
  });
}

function unavailableCopy(
  ticker: string | null,
  reasonCode?: NewsReasonCode,
): {
  title: string;
  detail: string;
} {
  const title = ticker
    ? `${ticker} news temporarily unavailable`
    : "Market news temporarily unavailable";

  if (reasonCode === "PROVIDER_RATE_LIMIT") {
    return {
      title,
      detail:
        "The configured news provider has reached its request limit. Try again later.",
    };
  }

  if (reasonCode === "PROVIDER_TIMEOUT") {
    return {
      title,
      detail:
        "The configured news provider did not respond in time. Try again later.",
    };
  }

  return {
    title,
    detail:
      "The configured news source is unavailable right now. No article was fabricated.",
  };
}

export function NewsDock() {
  const pathname = usePathname();
  const ticker = useMemo(() => detailTicker(pathname), [pathname]);
  const isLanding = pathname === "/";
  const visible = isLanding || ticker !== null;

  const [payload, setPayload] =
    useState<NewsPayload | null>(null);
  const [resolvedRequest, setResolvedRequest] = useState<string | null>(null);
  const requestKey = visible ? ticker ?? "MARKET" : null;

  useEffect(() => {
    if (!visible) return;

    const controller = new AbortController();
    const endpoint = ticker
      ? `/api/news?scope=ticker&ticker=${encodeURIComponent(ticker)}&limit=10`
      : "/api/news?scope=market&limit=10";

    fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as NewsPayload;
        if (!response.ok && body.status !== "UNAVAILABLE") {
          throw new Error(`HTTP ${response.status}`);
        }
        return body;
      })
      .then((body) => {
        setPayload(body);
        setResolvedRequest(requestKey);
      })
      .catch(() => {
        if (controller.signal.aborted) return;

        setPayload({
          scope: ticker ? "ticker" : "market",
          ticker,
          status: "UNAVAILABLE",
          provider: null,
          items: [],
          reasonCode: "PROVIDER_UNAVAILABLE",
        });
        setResolvedRequest(requestKey);
      });

    return () => controller.abort();
  }, [requestKey, ticker, visible]);

  if (!visible) return null;

  const title = ticker
    ? `${ticker} related news`
    : "Stock market news";
  const loading = resolvedRequest !== requestKey;
  const currentPayload = loading ? null : payload;

  const unavailable =
    currentPayload?.status === "UNAVAILABLE"
      ? unavailableCopy(ticker, currentPayload.reasonCode)
      : null;

  return (
    <section className={styles.wrap} aria-label={title}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>
            {ticker ? "RELATED NEWS" : "MARKET NEWS"}
          </div>
          <h2>{title}</h2>
          <p>
            {ticker
              ? `Articles returned here contain exact ${ticker} ticker evidence from the configured news provider.`
              : "Latest financial-markets headlines for the UNDERLY landing page."}
          </p>
        </div>
      </div>

      {loading && <div className={styles.state}>Loading news…</div>}

      {!loading && currentPayload?.status === "NOT_CONFIGURED" && (
        <div className={styles.state}>
          News is not configured for this deployment.
        </div>
      )}

      {!loading && unavailable && (
        <div className={styles.state}>
          <strong>{unavailable.title}</strong>
          <span>{unavailable.detail}</span>
        </div>
      )}

      {!loading &&
        currentPayload?.status === "AVAILABLE" &&
        currentPayload.items.length === 0 && (
          <div className={styles.state}>
            No matching articles in the current provider response.
          </div>
        )}

      {!loading &&
        currentPayload?.status === "AVAILABLE" &&
        currentPayload.items.length > 0 && (
          <div className={styles.grid}>
            {currentPayload.items.map((item) => {
              const requestedEvidence = ticker
                ? item.relatedTickers.find(
                    (evidence) => evidence.ticker === ticker,
                  )
                : null;

              return (
                <article
                  className={styles.card}
                  key={`${item.url}|${item.publishedAt}`}
                >
                  <div className={styles.meta}>
                    <span>{item.source}</span>
                    <span>{formatPublishedAt(item.publishedAt)}</span>
                  </div>

                  <a
                    className={styles.headline}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.headline}
                  </a>

                  <div className={styles.bottom}>
                    {ticker && requestedEvidence ? (
                      <span className={styles.relevance}>
                        {ticker}
                        {requestedEvidence.relevanceScore
                          ? ` · relevance ${requestedEvidence.relevanceScore}`
                          : ""}
                      </span>
                    ) : (
                      <div className={styles.tickers}>
                        {uniqueTickerEvidence(item.relatedTickers)
                          .slice(0, 4)
                          .map((evidence) => (
                            <Link
                              href={`/stock/${encodeURIComponent(evidence.ticker)}`}
                              key={evidence.ticker}
                            >
                              {evidence.ticker}
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
    </section>
  );
}
