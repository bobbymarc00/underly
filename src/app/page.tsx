"use client";

import { useState } from "react";
import { SearchPanel } from "@/components/underly/search-panel";
import { ResultView } from "@/components/underly/result-view";
import type { FirewallRequestPayload, FirewallResponse } from "@/lib/ui/response-types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FirewallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect(payload: FirewallRequestPayload) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/firewall/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as FirewallResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setResult(body);
      window.setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inspection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <section className="landing-shell">
        <nav className="topbar">
          <a className="brand" href="#top" aria-label="Underly home">
            <span className="brand-mark">U</span>
            <span>UNDERLY</span>
          </a>
          <div className="topbar-meta">
            <span><i className="live-dot" /> LIVE · BNB SMART CHAIN</span>
            <span>READ-ONLY v0.1</span>
          </div>
        </nav>

        <section className="hero" id="top">
          <div className="hero-copy">
            <span className="kicker">TOKENIZED EQUITY INSPECTION</span>
            <h1>Know what you<br /><em>really hold.</em></h1>
            <p>
              One stock can have multiple wrappers. Underly compares identity, reference pricing,
              execution conditions, conservative value and evidence — wrapper by wrapper.
            </p>
          </div>
          <div className="hero-principles">
            <div><strong>01</strong><span>Every available wrapper</span></div>
            <div><strong>02</strong><span>Missing data ≠ pass</span></div>
            <div><strong>03</strong><span>Evidence, not a black-box score</span></div>
          </div>
        </section>

        <SearchPanel loading={loading} onRun={inspect} />

        {error && (
          <div className="request-error" role="alert">
            <span>REQUEST FAILED</span>
            <strong>{error}</strong>
            <p>No result was fabricated. Underly remains fail-closed when the requested evidence cannot be obtained.</p>
          </div>
        )}
      </section>

      {loading && (
        <section className="loading-shell" aria-live="polite">
          <div className="loading-line"><i /></div>
          <span>Resolving wrappers · pricing · market state · execution · proof</span>
        </section>
      )}

      {result && <ResultView result={result} />}

      <footer className="site-footer">
        <span>UNDERLY · Know what you really hold.</span>
        <span>Read-only inspection layer · No wallet signing · No transaction broadcast</span>
      </footer>
    </main>
  );
}
