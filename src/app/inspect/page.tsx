"use client";

import { useState } from "react";

import { ResultView } from "@/components/underly/result-view";
import { SearchPanel } from "@/components/underly/search-panel";
import { TerminalHeader } from "@/components/market/TerminalHeader";
import type {
  FirewallRequestPayload,
  FirewallResponse,
} from "@/lib/ui/response-types";

export default function InspectorPage() {
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
      const body = (await response.json()) as FirewallResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      setResult(body);
      window.setTimeout(
        () =>
          document
            .getElementById("results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        40,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Inspection failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <TerminalHeader active="inspector" />

      <section className="landing-shell tm-legacy-shell">
        <section className="hero" id="top">
          <div className="hero-copy">
            <span className="kicker">FROZEN V0.1 INSPECTOR</span>
            <h1>
              Inspect wrapper
              <br />
              <em>execution reality.</em>
            </h1>
            <p>
              The original deterministic firewall remains available as a
              specialist inspection surface while the main product moves to
              the market-terminal interface.
            </p>
          </div>
          <div className="hero-principles">
            <div>
              <strong>01</strong>
              <span>Every available wrapper</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Missing data ≠ pass</span>
            </div>
            <div>
              <strong>03</strong>
              <span>Quote observation, never execution</span>
            </div>
          </div>
        </section>

        <SearchPanel loading={loading} onRun={inspect} />

        {error && (
          <div className="request-error" role="alert">
            <span>REQUEST FAILED</span>
            <strong>{error}</strong>
            <p>
              No result was fabricated. Underly remains fail-closed when the
              requested evidence cannot be obtained.
            </p>
          </div>
        )}
      </section>

      {loading && (
        <section className="loading-shell" aria-live="polite">
          <div className="loading-line">
            <i />
          </div>
          <span>
            Resolving wrappers · pricing · market state · execution · proof
          </span>
        </section>
      )}

      {result && <ResultView result={result} />}
    </main>
  );
}
