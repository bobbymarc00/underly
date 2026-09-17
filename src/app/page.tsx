"use client";

import { FormEvent, useState } from "react";

type Intent = "BUY" | "HOLD" | "SELL" | "COLLATERAL";

function amountLabel(intent: Intent): string {
  if (intent === "BUY") return "Trade amount (USD notional)";
  if (intent === "SELL") return "Position value to exit (USD)";
  if (intent === "COLLATERAL") return "Collateral position value (USD)";
  return "Position value (USD)";
}

export default function Home() {
  const [ticker, setTicker] = useState("NVDA");
  const [amount, setAmount] = useState("1000");
  const [intent, setIntent] = useState<Intent>("BUY");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function unwrap(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/firewall/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, intent, amountUsd: amount }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">UNDERLY v0.1</div>
        <h1>Know what you really hold.</h1>
        <p>Unwrap tokenized equities into identity, reference, execution conditions, wrapper data and conservative value.</p>
      </section>

      <form className="panel form" onSubmit={unwrap}>
        <label>
          Tokenized stock ticker
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="NVDA" />
        </label>
        <label>
          Intent
          <select value={intent} onChange={(e) => setIntent(e.target.value as Intent)}>
            <option>BUY</option><option>HOLD</option><option>SELL</option><option>COLLATERAL</option>
          </select>
        </label>
        <label>
          {amountLabel(intent)}
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="1000" />
        </label>
        <button disabled={loading}>{loading ? "UNWRAPPING…" : "UNWRAP"}</button>
      </form>

      {error && <div className="panel error">{error}</div>}
      {result !== null && (
        <section className="panel output">
          <div className="outputHead"><strong>Live Underly response</strong><span>debug UI</span></div>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}

      <footer>Read-only MVP. No wallet signing. No transaction broadcast.</footer>
    </main>
  );
}
