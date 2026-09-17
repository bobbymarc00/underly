"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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

interface NewsPayload {
  scope: "market" | "ticker";
  ticker: string | null;
  status: "AVAILABLE" | "NOT_CONFIGURED" | "UNAVAILABLE";
  provider: string | null;
  items: NewsItem[];
  note?: string;
  error?: string;
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

export function NewsDock() {
  const pathname = usePathname();
  const router = useRouter();
  const ticker = useMemo(
    () => detailTicker(pathname),
    [pathname],
  );
  const isLanding = pathname === "/";
  const visible = isLanding || ticker !== null;

  const [payload, setPayload] =
    useState<NewsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [navTicker, setNavTicker] = useState("NVDA");

  useEffect(() => {
    if (!visible) return;

    const controller = new AbortController();
    const endpoint = ticker
      ? `/api/news?scope=ticker&ticker=${encodeURIComponent(ticker)}&limit=10`
      : "/api/news?scope=market&limit=10";

    setLoading(true);

    fetch(endpoint, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as NewsPayload;
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setPayload)
      .catch((error) => {
        if (controller.signal.aborted) return;

        setPayload({
          scope: ticker ? "ticker" : "market",
          ticker,
          status: "UNAVAILABLE",
          provider: null,
          items: [],
          error:
            error instanceof Error
              ? error.message
              : "News request failed",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ticker, visible]);

  if (!visible) return null;

  function openTicker(event: FormEvent) {
    event.preventDefault();
    const normalized = navTicker.trim().toUpperCase();

    if (!/^[A-Z0-9.-]{1,20}$/.test(normalized)) return;

    router.push(`/stock/${encodeURIComponent(normalized)}`);
  }

  const title = ticker
    ? `${ticker} related news`
    : "Stock market news";

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

        {isLanding && (
          <form className={styles.jump} onSubmit={openTicker}>
            <input
              aria-label="Open stock ticker"
              value={navTicker}
              onChange={(event) =>
                setNavTicker(event.target.value.toUpperCase())
              }
              placeholder="NVDA"
              maxLength={20}
            />
            <button type="submit">Open stock</button>
          </form>
        )}
      </div>

      {loading && (
        <div className={styles.state}>Loading news…</div>
      )}

      {!loading && payload?.status === "NOT_CONFIGURED" && (
        <div className={styles.state}>
          News provider is not configured.
        </div>
      )}

      {!loading && payload?.status === "UNAVAILABLE" && (
        <div className={styles.state}>
          {payload.error ?? "News is currently unavailable."}
        </div>
      )}

      {!loading &&
        payload?.status === "AVAILABLE" &&
        payload.items.length === 0 && (
          <div className={styles.state}>
            No matching articles in the current provider response.
          </div>
        )}

      {!loading &&
        payload?.status === "AVAILABLE" &&
        payload.items.length > 0 && (
          <div className={styles.grid}>
            {payload.items.map((item) => {
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
                        {item.relatedTickers
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
