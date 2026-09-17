"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  FirewallRequestPayload,
  Intent,
  SearchItem,
  SearchResponse,
} from "@/lib/ui/response-types";
import { providerLabel } from "@/lib/ui/format";

type SizeMode = "NONE" | "USD" | "TOKEN";

interface SearchPanelProps {
  loading: boolean;
  onRun: (payload: FirewallRequestPayload) => void;
}

const positiveDecimal = /^\d+(?:\.\d+)?$/;
const contractPattern = /^0x[a-fA-F0-9]{40}$/;

function defaultSizeMode(intent: Intent): SizeMode {
  if (intent === "HOLD") return "NONE";
  if (intent === "BUY") return "USD";
  return "TOKEN";
}

export function SearchPanel({ loading, onRun }: SearchPanelProps) {
  const [query, setQuery] = useState("NVDA");
  const [intent, setIntent] = useState<Intent>("BUY");
  const [sizeMode, setSizeMode] = useState<SizeMode>("USD");
  const [amount, setAmount] = useState("1000");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const isContract = contractPattern.test(query.trim());
  const activeItem = useMemo(
    () => items.find((item) => item.ticker.toUpperCase() === query.trim().toUpperCase()),
    [items, query],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || contractPattern.test(q)) {
      setItems([]);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const payload = (await response.json()) as SearchResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        setItems(payload.data ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setItems([]);
        setSearchError(error instanceof Error ? error.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function changeIntent(next: Intent) {
    setIntent(next);
    const mode = defaultSizeMode(next);
    setSizeMode(mode);
    setValidation(null);
    if (next === "BUY" && amount === "") setAmount("1000");
    if (next === "HOLD") setAmount("");
    if ((next === "SELL" || next === "COLLATERAL") && amount === "") setAmount("1");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    setValidation(null);

    if (!clean) {
      setValidation("Enter a ticker or BSC contract address.");
      return;
    }

    const requiresAmount = intent === "BUY" || intent === "SELL" || intent === "COLLATERAL";
    if ((requiresAmount || sizeMode !== "NONE") && (!amount || !positiveDecimal.test(amount) || Number(amount) <= 0)) {
      setValidation("Enter a positive decimal amount.");
      return;
    }

    const payload: FirewallRequestPayload = {
      intent,
      ...(isContract ? { contractAddress: clean } : { ticker: clean.toUpperCase() }),
    };

    if (intent === "BUY") payload.amountUsd = amount;
    if (intent === "HOLD" && sizeMode === "USD") payload.amountUsd = amount;
    if (intent === "HOLD" && sizeMode === "TOKEN") payload.tokenAmount = amount;
    if ((intent === "SELL" || intent === "COLLATERAL") && sizeMode === "USD") payload.amountUsd = amount;
    if ((intent === "SELL" || intent === "COLLATERAL") && sizeMode === "TOKEN") payload.tokenAmount = amount;

    onRun(payload);
  }

  const showSizeSelector = intent !== "BUY";
  const suggestionOpen = focused && !isContract && (items.length > 0 || searching || searchError);

  return (
    <form className="inspect-panel" onSubmit={submit}>
      <div className="inspect-copy">
        <span className="kicker">LIVE WRAPPER INSPECTION</span>
        <h2>Unwrap the same stock across every available wrapper.</h2>
        <p>
          Underly asks Binance Web3 for the current BSC wrapper universe and compares each result independently.
        </p>
      </div>

      <div className="inspect-controls">
        <div className="field asset-field">
          <label htmlFor="asset">Ticker or contract</label>
          <div className="search-input-wrap">
            <input
              id="asset"
              value={query}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="NVDA or 0x…"
            />
            <span className="search-state">{searching ? "SEARCHING" : isContract ? "CONTRACT" : "BSC RWA"}</span>
            {suggestionOpen && (
              <div className="suggestions">
                {searching && <div className="suggestion-muted">Discovering wrappers…</div>}
                {searchError && <div className="suggestion-error">{searchError}</div>}
                {!searching && !searchError && items.map((item) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={item.ticker}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setQuery(item.ticker);
                      setFocused(false);
                    }}
                  >
                    <span>
                      <strong>{item.ticker}</strong>
                      <small>{item.companyName}</small>
                    </span>
                    <span className="provider-stack">
                      {item.wrappers.map((wrapper) => (
                        <em key={`${wrapper.platform}-${wrapper.contractAddress}`}>
                          {providerLabel(wrapper.platform)} · {wrapper.symbol}
                        </em>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeItem && (
            <div className="discovery-line">
              <span>{activeItem.wrappers.length} wrapper{activeItem.wrappers.length === 1 ? "" : "s"} discovered</span>
              <span>{activeItem.wrappers.map((w) => providerLabel(w.platform)).join(" · ")}</span>
            </div>
          )}
        </div>

        <div className="field">
          <label>Intent</label>
          <div className="segment four">
            {(["BUY", "HOLD", "SELL", "COLLATERAL"] as Intent[]).map((value) => (
              <button
                type="button"
                key={value}
                data-active={intent === value}
                onClick={() => changeIntent(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {showSizeSelector && (
          <div className="field">
            <label>Position input</label>
            <div className={`segment ${intent === "HOLD" ? "three" : "two"}`}>
              {intent === "HOLD" && (
                <button type="button" data-active={sizeMode === "NONE"} onClick={() => { setSizeMode("NONE"); setAmount(""); }}>
                  No size
                </button>
              )}
              <button type="button" data-active={sizeMode === "TOKEN"} onClick={() => { setSizeMode("TOKEN"); if (!amount) setAmount("1"); }}>
                Token qty
              </button>
              <button type="button" data-active={sizeMode === "USD"} onClick={() => { setSizeMode("USD"); if (!amount) setAmount("1000"); }}>
                USD notional
              </button>
            </div>
          </div>
        )}

        {(intent === "BUY" || sizeMode !== "NONE") && (
          <div className="field amount-field">
            <label htmlFor="amount">
              {intent === "BUY" || sizeMode === "USD" ? "USD amount" : "Token quantity"}
            </label>
            <div className="amount-input-wrap">
              <span>{intent === "BUY" || sizeMode === "USD" ? "$" : "QTY"}</span>
              <input
                id="amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder={sizeMode === "TOKEN" ? "4.5" : "1000"}
              />
            </div>
          </div>
        )}

        <button className="primary-action" disabled={loading}>
          <span>{loading ? "INSPECTING" : "UNWRAP ALL"}</span>
          <span aria-hidden="true">↗</span>
        </button>

        <div className="inspect-footnote">
          <span className="live-dot" />
          Read-only. No wallet signing. No transaction broadcast. No global safety score.
        </div>

        {validation && <div className="inline-error">{validation}</div>}
      </div>
    </form>
  );
}
