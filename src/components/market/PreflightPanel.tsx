"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import {
  formatNumber,
  formatPct,
  formatUsd,
  providerLabel,
} from "@/lib/ui/format";

type DecisionStatus = "READY" | "REVIEW" | "BLOCKED";

type PreflightResponse = {
  version: string;
  generatedAt: string;
  mode: "QUOTE_ONLY" | "WALLET_SIMULATION";
  status: DecisionStatus;
  request: {
    ticker: string;
    amountUsd: string;
    walletAddress: string | null;
    maxReferenceGapPct: string | null;
    slippagePercent: string;
  };
  summary: {
    candidateCount: number;
    ready: number;
    review: number;
    blocked: number;
  };
  candidates: Array<{
    provider: string;
    symbol: string;
    contractAddress: string;
    decision: {
      status: DecisionStatus;
      reasons: Array<{
        code: string;
        severity: "BLOCK" | "REVIEW" | "INFO";
        message: string;
      }>;
    };
    economic: {
      tokenShareRatio: string | null;
      referenceGapPct: string | null;
      quotedTokenAmount: string | null;
      quotedUnderlyingShares: string | null;
      quotedReferenceValueUsd: string | null;
    };
    marketSession: {
      tradingAvailable: boolean | null;
      status: string | null;
      nextOpenAt: number | null;
    };
    integrity: {
      status: "PASS" | "WARN" | "UNKNOWN";
      dataCompleteness: "COMPLETE" | "PARTIAL";
    };
    corporateActions: {
      status: "CLEAR" | "ACTIVE" | "UNKNOWN";
    };
    quote: {
      state: "AVAILABLE" | "UNAVAILABLE";
      vendor: string | null;
      priceImpactPercent: string | null;
      quoteIdReturned: boolean;
      reverse: {
        available: boolean;
        recoveredUsd: string | null;
        recoveryPct: string | null;
        frictionPct: string | null;
      };
    };
    simulation: {
      requested: boolean;
      state: string;
      failReason: string | null;
      direction: string;
      build: {
        available: boolean;
        transactionTarget: string | null;
        executionMode: string | null;
        calldataReturned: false;
      };
      rawTransactionReturned: false;
    };
  }>;
  readOnly: {
    privateKeyRequired: false;
    signatureRequested: false;
    transactionBroadcast: false;
    rawTransactionReturned: false;
  };
  error?: string;
};

function pctWithSign(value: string | null): string {
  if (value === null) return "Unknown";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return formatPct(value);
  return `${parsed > 0 ? "+" : ""}${formatPct(parsed)}`;
}

function sessionLabel(value: boolean | null, status: string | null): string {
  if (value === true) return status ? `OPEN · ${status}` : "OPEN";
  if (value === false) return status ? `CLOSED · ${status}` : "CLOSED";
  return status ?? "UNKNOWN";
}

export function PreflightPanel({ ticker }: { ticker: string }) {
  const [amountUsd, setAmountUsd] = useState("25");
  const [walletAddress, setWalletAddress] = useState("");
  const [maxReferenceGapPct, setMaxReferenceGapPct] = useState("");
  const [result, setResult] = useState<PreflightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  function invalidateRequest() {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
    setResult(null);
    setError(null);
  }

  useEffect(
    () => () => {
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
    },
    [],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const requestedTicker = ticker;
    const requestedAmountUsd = amountUsd;
    const requestedWalletAddress = walletAddress.trim();
    const requestedMaxReferenceGapPct = maxReferenceGapPct.trim();

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: requestedTicker,
          amountUsd: requestedAmountUsd,
          slippagePercent: "0.5",
          ...(requestedWalletAddress
            ? { walletAddress: requestedWalletAddress }
            : {}),
          ...(requestedMaxReferenceGapPct
            ? { maxReferenceGapPct: requestedMaxReferenceGapPct }
            : {}),
        }),
        signal: controller.signal,
      });

      const body = (await response.json()) as PreflightResponse;
      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      if (
        controller.signal.aborted ||
        requestSequenceRef.current !== requestSequence
      ) {
        return;
      }

      if (body.request.ticker.toUpperCase() !== requestedTicker.toUpperCase()) {
        throw new Error("Preflight response context mismatch");
      }

      setResult(body);
    } catch (caught) {
      if (
        controller.signal.aborted ||
        requestSequenceRef.current !== requestSequence
      ) {
        return;
      }

      setResult(null);
      setError(
        caught instanceof Error ? caught.message : "Preflight failed",
      );
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section id="preflight" className="tm-shell tm-preflight">
      <div className="tm-preflight-head">
        <div>
          <span className="tm-eyebrow">UNDERLY PREFLIGHT · BSC</span>
          <h2>Verify an exposure before any signature exists.</h2>
          <p>
            Compare every discovered BSC representation using current economic
            equivalence, ActionGuard, integrity, entry/exit liquidity, and an
            optional Binance Transaction API wallet simulation.
          </p>
        </div>

        <form className="tm-preflight-form" onSubmit={submit}>
          <label className="tm-preflight-field">
            <span>USD EXPOSURE</span>
            <input
              inputMode="decimal"
              value={amountUsd}
              onChange={(event) => {
                setAmountUsd(event.target.value);
                invalidateRequest();
              }}
              aria-label="Preflight USD exposure"
            />
          </label>

          <label className="tm-preflight-field">
            <span>PUBLIC WALLET · OPTIONAL</span>
            <input
              value={walletAddress}
              onChange={(event) => {
                setWalletAddress(event.target.value);
                invalidateRequest();
              }}
              placeholder="0x… for unsigned simulation"
              aria-label="Preflight public wallet address"
            />
          </label>

          <label className="tm-preflight-field">
            <span>MAX REF GAP % · OPTIONAL</span>
            <input
              inputMode="decimal"
              value={maxReferenceGapPct}
              onChange={(event) => {
                setMaxReferenceGapPct(event.target.value);
                invalidateRequest();
              }}
              placeholder="e.g. 1"
              aria-label="Maximum reference gap guard"
            />
          </label>

          <button
            type="submit"
            className="tm-preflight-submit"
            disabled={loading}
          >
            {loading
              ? "RUNNING…"
              : walletAddress.trim()
                ? "SIMULATE"
                : "PREFLIGHT"}
          </button>
        </form>
      </div>

      <p className="tm-preflight-boundary">
        QUOTE / BUILD / SIMULATE ONLY · NO PRIVATE KEY · NO SIGNATURE · NO
        BROADCAST · NO AUTOMATIC WRAPPER SELECTION
      </p>

      {error && (
        <div className="tm-callout tm-callout-error">
          <span>PREFLIGHT UNAVAILABLE</span>
          <strong>{error}</strong>
          <small>No readiness state was fabricated.</small>
        </div>
      )}

      {result && (
        <>
          <div className="tm-preflight-summary">
            <span data-state={result.status}>{result.status}</span>
            <span>{result.mode.replaceAll("_", " ")}</span>
            <span>{result.summary.candidateCount} REPRESENTATIONS</span>
            <span data-state="READY">{result.summary.ready} READY</span>
            <span data-state="REVIEW">{result.summary.review} REVIEW</span>
            <span data-state="BLOCKED">{result.summary.blocked} BLOCKED</span>
          </div>

          <div className="tm-preflight-grid">
            {result.candidates.map((candidate) => (
              <article
                className="tm-preflight-card"
                key={candidate.contractAddress}
              >
                <div className="tm-preflight-card-head">
                  <div>
                    <span>{providerLabel(candidate.provider)}</span>
                    <strong>{candidate.symbol}</strong>
                    <small>{candidate.contractAddress}</small>
                  </div>
                  <em
                    className="tm-preflight-status"
                    data-state={candidate.decision.status}
                  >
                    {candidate.decision.status}
                  </em>
                </div>

                <div className="tm-preflight-metrics">
                  <div>
                    <span>UNDERLYING-EQUIV</span>
                    <strong>
                      {formatNumber(
                        candidate.economic.quotedUnderlyingShares,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>REFERENCE VALUE</span>
                    <strong>
                      {formatUsd(
                        candidate.economic.quotedReferenceValueUsd,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>REFERENCE GAP</span>
                    <strong>
                      {pctWithSign(candidate.economic.referenceGapPct)}
                    </strong>
                  </div>
                  <div>
                    <span>ENTRY ROUTE</span>
                    <strong>
                      {candidate.quote.state === "AVAILABLE"
                        ? candidate.quote.vendor ?? "AVAILABLE"
                        : "UNAVAILABLE"}
                    </strong>
                  </div>
                  <div>
                    <span>ROUND-TRIP RECOVERY</span>
                    <strong>
                      {candidate.quote.reverse.recoveryPct
                        ? formatPct(candidate.quote.reverse.recoveryPct)
                        : "Unknown"}
                    </strong>
                  </div>
                  <div>
                    <span>SESSION</span>
                    <strong>
                      {sessionLabel(
                        candidate.marketSession.tradingAvailable,
                        candidate.marketSession.status,
                      )}
                    </strong>
                  </div>
                </div>

                <div className="tm-preflight-sim">
                  <span>TRANSACTION SIMULATION</span>
                  <strong>
                    {candidate.simulation.requested
                      ? `${candidate.simulation.state} · ${candidate.simulation.direction}`
                      : "NOT REQUESTED · QUOTE ONLY"}
                  </strong>
                  <p className="tm-preflight-note">
                    Integrity {candidate.integrity.status} · ActionGuard{" "}
                    {candidate.corporateActions.status} · 0.5% simulation
                    slippage tolerance
                  </p>
                </div>

                <div className="tm-preflight-reasons">
                  {candidate.decision.reasons.map((item) => (
                    <div
                      className="tm-preflight-reason"
                      data-severity={item.severity}
                      key={item.code}
                    >
                      <em>{item.code.replaceAll("_", " ")}</em>
                      <p>{item.message}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
