"use client";

import { useEffect, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import type {
  SearchItem,
  SearchResponse,
} from "@/lib/ui/response-types";
import { providerLabel } from "@/lib/ui/format";

function uniqueSearchItems(items: SearchItem[]): SearchItem[] {
  const byTicker = new Map<string, SearchItem>();

  for (const item of items) {
    const ticker = item.ticker.trim().toUpperCase();
    if (!ticker) continue;

    const current = byTicker.get(ticker);
    if (!current) {
      byTicker.set(ticker, {
        ...item,
        ticker,
        wrappers: [...item.wrappers],
      });
      continue;
    }

    const wrapperIds = new Set(
      current.wrappers.map(
        (wrapper) =>
          `${wrapper.chainId}:${wrapper.contractAddress.toLowerCase()}`,
      ),
    );
    for (const wrapper of item.wrappers) {
      const identity =
        `${wrapper.chainId}:${wrapper.contractAddress.toLowerCase()}`;
      if (!wrapperIds.has(identity)) {
        wrapperIds.add(identity);
        current.wrappers.push(wrapper);
      }
    }
  }

  return [...byTicker.values()];
}

export function TickerSearch({
  compact = false,
  initialValue = "",
}: {
  compact?: boolean;
  initialValue?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) {
          setItems([]);
          return;
        }
        const payload = (await response.json()) as SearchResponse;
        setItems(uniqueSearchItems(payload.data ?? []));
      } catch {
        if (!controller.signal.aborted) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function openTicker(ticker?: string) {
    const normalized = (ticker ?? query).trim().toUpperCase();
    if (!/^[A-Z0-9.-]{1,20}$/.test(normalized)) return;
    setFocused(false);
    router.push(`/stock/${encodeURIComponent(normalized)}`);
  }

  const visible = focused && query.trim() && (loading || items.length > 0);

  return (
    <div className={`tm-search ${compact ? "tm-search-compact" : ""}`}>
      <div className="tm-search-input">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search tokenized equity"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={compact ? "Search ticker…" : "Search NVDA, TSLA, AAPL…"}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setQuery(event.target.value.toUpperCase());
            setItems([]);
            setLoading(false);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") openTicker();
          }}
        />
        {!compact && (
          <button type="button" onClick={() => openTicker()}>
            OPEN
          </button>
        )}
      </div>

      {visible && (
        <div className="tm-search-menu">
          {loading && (
            <div className="tm-search-state">DISCOVERING WRAPPERS…</div>
          )}
          {!loading &&
            items.slice(0, 8).map((item) => (
              <button
                type="button"
                key={item.ticker}
                className="tm-search-result"
                onMouseDown={(event: MouseEvent<HTMLButtonElement>) => event.preventDefault()}
                onClick={() => openTicker(item.ticker)}
              >
                <span>
                  <strong>{item.ticker}</strong>
                  <small>{item.companyName}</small>
                </span>
                <span className="tm-provider-chips">
                  {item.wrappers.slice(0, 3).map((wrapper) => (
                    <em
                      key={`${wrapper.platform}-${wrapper.contractAddress}`}
                    >
                      {providerLabel(wrapper.platform)}
                    </em>
                  ))}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
