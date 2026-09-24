"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  compactAddress,
  formatNumber,
  formatPct,
  formatTimestamp,
  formatUsd,
  providerLabel,
} from "@/lib/ui/format";
import type {
  PortfolioPayload,
  PortfolioPosition,
} from "@/lib/ui/market-types";
import type { PortfolioComparisonResult } from "@/lib/underly/portfolio-comparison";
import {
  isCurrentComparisonResponse,
  isPortfolioComparisonResult,
} from "@/lib/ui/portfolio-comparison";
import {
  buildContinuityHref,
  isCurrentPortfolioResponse,
  isPortfolioPayload,
  portfolioValuePresentation,
} from "@/lib/ui/portfolio";

import { TerminalHeader } from "./TerminalHeader";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function statusMessage(error: string | undefined, fallback: string): string {
  switch (error) {
    case "RPC_CHAIN_MISMATCH":
      return "The configured read-only RPC is not connected to BNB Smart Chain (chain 56).";
    case "RWA_UNIVERSE_TIMEOUT":
      return "The tokenized-equity universe provider timed out.";
    case "RWA_UNIVERSE_EMPTY":
      return "No validated BSC tokenized-equity wrapper universe was available, so wallet coverage cannot be established.";
    case "READ_ONLY_RPC_NOT_CONFIGURED":
      return "Read-only BSC RPC is not configured.";
    case "PORTFOLIO_READ_FAILED":
      return "The portfolio snapshot could not be completed.";
    default:
      return error ?? fallback;
  }
}

function marketSession(position: PortfolioPosition): string {
  if (!position.marketSession) return "UNKNOWN";
  if (position.marketSession.tradingAvailable === true) {
    return position.marketSession.status ?? "TRADING AVAILABLE";
  }
  if (position.marketSession.tradingAvailable === false) {
    return position.marketSession.status ?? "NOT TRADING";
  }
  return position.marketSession.status ?? "UNKNOWN";
}

function evidenceTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status === "AVAILABLE" || status === "PASS" || status === "CLEAR") {
    return "good";
  }
  if (status === "PARTIAL" || status === "WARN" || status === "ACTIVE") {
    return "warn";
  }
  if (status === "ERROR" || status === "INVALID" || status === "BLOCKED") {
    return "bad";
  }
  return "neutral";
}

function signedEvidence(value: string | null, suffix = ""): string {
  if (value === null) return "UNKNOWN";
  if (value === "0") return `0${suffix}`;
  return `${value.startsWith("-") ? "" : "+"}${value}${suffix}`;
}

export function WalletTerminal() {
  // The legacy /api/wallet-inspector endpoint remains available. This unified
  // view reuses the same inspector core through /api/portfolio to avoid a
  // duplicate balance snapshot request for the same public EVM address.
  const [address, setAddress] = useState("");
  const [submittedAddress, setSubmittedAddress] = useState<string | null>(null);
  const [result, setResult] = useState<PortfolioPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotA, setSnapshotA] = useState<PortfolioPayload | null>(null);
  const [snapshotB, setSnapshotB] = useState<PortfolioPayload | null>(null);
  const [comparison, setComparison] =
    useState<PortfolioComparisonResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const comparisonSequence = useRef(0);
  const comparisonController = useRef<AbortController | null>(null);
  const comparisonPair = useRef("");
  const currentAddress = useRef("");

  useEffect(
    () => () => {
      controller.current?.abort();
      comparisonController.current?.abort();
    },
    [],
  );

  function changeAddress(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    currentAddress.current = next;
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    comparisonSequence.current += 1;
    comparisonController.current?.abort();
    comparisonController.current = null;
    comparisonPair.current = "";
    setAddress(next);
    setSubmittedAddress(null);
    setResult(null);
    setError(null);
    setLoading(false);
    setSnapshotA(null);
    setSnapshotB(null);
    setComparison(null);
    setComparisonError(null);
    setComparisonLoading(false);
  }

  async function inspect(event: FormEvent) {
    event.preventDefault();
    const clean = address.trim().toLowerCase();

    if (!EVM_ADDRESS.test(clean)) {
      sequence.current += 1;
      controller.current?.abort();
      setSubmittedAddress(null);
      setResult(null);
      setError("Enter a valid public EVM address.");
      setLoading(false);
      return;
    }

    controller.current?.abort();
    const requestController = new AbortController();
    controller.current = requestController;
    const requestSequence = sequence.current + 1;
    sequence.current = requestSequence;
    setSubmittedAddress(clean);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/portfolio?address=${encodeURIComponent(clean)}`,
        {
          cache: "no-store",
          signal: requestController.signal,
        },
      );
      const body: unknown = await response.json();

      if (!isPortfolioPayload(body)) {
        throw new Error(`Invalid portfolio response (HTTP ${response.status})`);
      }
      if (body.address.toLowerCase() !== clean) {
        throw new Error("Portfolio response wallet mismatch");
      }
      if (
        requestController.signal.aborted ||
        requestSequence !== sequence.current ||
        currentAddress.current.trim().toLowerCase() !== clean
      ) {
        return;
      }

      setResult(body);
      if (!response.ok) {
        setError(statusMessage(body.error, `HTTP ${response.status}`));
      }
    } catch (caught) {
      if (
        requestController.signal.aborted ||
        requestSequence !== sequence.current
      ) {
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Portfolio inspection failed",
      );
    } finally {
      if (
        !requestController.signal.aborted &&
        requestSequence === sequence.current
      ) {
        setLoading(false);
      }
    }
  }

  const displayedResult = isCurrentPortfolioResponse(
    result,
    address,
    submittedAddress,
  )
    ? result
    : null;
  const valuePresentation = displayedResult
    ? portfolioValuePresentation(displayedResult)
    : null;
  const failedChecks =
    displayedResult?.balanceChecks.filter(
      (check) =>
        check.status === "RPC_ERROR" || check.status === "BALANCE_INVALID",
    ) ?? [];
  const capturableResult =
    displayedResult?.snapshot &&
    displayedResult.universe &&
    displayedResult.summary &&
    displayedResult.exposures &&
    ["AVAILABLE", "PARTIAL"].includes(displayedResult.status)
      ? displayedResult
      : null;
  const displayedComparison = isCurrentComparisonResponse({
    result: comparison,
    inputAddress: address,
    snapshotA,
    snapshotB,
  })
    ? comparison
    : null;

  function invalidateComparison() {
    comparisonSequence.current += 1;
    comparisonController.current?.abort();
    comparisonController.current = null;
    comparisonPair.current = "";
    setComparison(null);
    setComparisonError(null);
    setComparisonLoading(false);
  }

  function captureSnapshot(slot: "A" | "B") {
    if (!capturableResult) return;
    invalidateComparison();
    if (slot === "A") setSnapshotA(capturableResult);
    else setSnapshotB(capturableResult);
  }

  async function compareSnapshots() {
    if (!snapshotA || !snapshotB) {
      setComparisonError("Capture both Snapshot A and Snapshot B first.");
      return;
    }
    const clean = address.trim().toLowerCase();
    if (
      !EVM_ADDRESS.test(clean) ||
      snapshotA.address.toLowerCase() !== clean ||
      snapshotB.address.toLowerCase() !== clean
    ) {
      invalidateComparison();
      setComparisonError("Snapshot wallet does not match the current address.");
      return;
    }

    comparisonController.current?.abort();
    const requestController = new AbortController();
    comparisonController.current = requestController;
    const requestSequence = comparisonSequence.current + 1;
    comparisonSequence.current = requestSequence;
    const pair = `${snapshotA.generatedAt}|${snapshotB.generatedAt}`;
    comparisonPair.current = pair;
    setComparisonLoading(true);
    setComparisonError(null);
    setComparison(null);

    try {
      const response = await fetch("/api/portfolio/compare", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshotA, snapshotB }),
        signal: requestController.signal,
      });
      const body: unknown = await response.json();
      if (!isPortfolioComparisonResult(body)) {
        const apiError =
          typeof body === "object" && body !== null && "error" in body
            ? String(body.error)
            : `HTTP ${response.status}`;
        throw new Error(`Portfolio comparison failed: ${apiError}`);
      }
      if (
        requestController.signal.aborted ||
        requestSequence !== comparisonSequence.current ||
        comparisonPair.current !== pair ||
        currentAddress.current.trim().toLowerCase() !== clean
      ) {
        return;
      }
      setComparison(body);
    } catch (caught) {
      if (
        requestController.signal.aborted ||
        requestSequence !== comparisonSequence.current
      ) {
        return;
      }
      setComparisonError(
        caught instanceof Error ? caught.message : "Portfolio comparison failed",
      );
    } finally {
      if (
        !requestController.signal.aborted &&
        requestSequence === comparisonSequence.current
      ) {
        setComparisonLoading(false);
      }
    }
  }

  return (
    <main className="tm-app">
      <TerminalHeader active="wallet" />

      <section className="tm-shell tm-wallet-head">
        <div className="tm-eyebrow">UNIFIED PORTFOLIO · PUBLIC ADDRESS · READ ONLY</div>
        <h1>Tokenized-equity portfolio.</h1>
        <p>
          One BSC snapshot combines the existing wallet balance inspector with
          verified underlying identity, current equivalence, provider evidence,
          and indicative valuation. No connection, signature, approval, private
          key, quote, or transaction is requested.
        </p>

        <form className="tm-wallet-form" onSubmit={inspect}>
          <input
            value={address}
            onChange={changeAddress}
            placeholder="0x public BNB Smart Chain address"
            aria-label="Public wallet address"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={loading}>
            {loading ? "READING SNAPSHOT…" : "INSPECT PORTFOLIO"}
          </button>
        </form>
      </section>

      <section className="tm-shell tm-portfolio-compare">
        <div className="tm-section-head tm-section-head-tight">
          <div>
            <span>PORTFOLIO SNAPSHOT COMPARISON · SESSION MEMORY</span>
            <h2>Compare two manual captures.</h2>
          </div>
          <small className="tm-portfolio-method">
            Exact chain + contract identity · client-supplied portfolio responses
          </small>
        </div>

        <p className="tm-comparison-disclaimer">
          Capture the currently displayed portfolio as A, inspect the same public
          wallet again later, then capture B. Refreshing or closing this page
          removes both snapshots because v0.9-A does not persist them.
        </p>

        <div className="tm-comparison-controls">
          <button
            type="button"
            disabled={!capturableResult}
            onClick={() => captureSnapshot("A")}
          >
            CAPTURE SNAPSHOT A
          </button>
          <button
            type="button"
            disabled={!capturableResult}
            onClick={() => captureSnapshot("B")}
          >
            CAPTURE SNAPSHOT B
          </button>
          <button
            type="button"
            disabled={!snapshotA || !snapshotB || comparisonLoading}
            onClick={compareSnapshots}
          >
            {comparisonLoading ? "COMPARING…" : "COMPARE"}
          </button>
        </div>

        <div className="tm-comparison-snapshots">
          {(["A", "B"] as const).map((slot) => {
            const captured = slot === "A" ? snapshotA : snapshotB;
            return (
              <article key={slot}>
                <span>SNAPSHOT {slot}</span>
                {captured ? (
                  <>
                    <strong>BLOCK {captured.snapshot?.blockNumber ?? "UNKNOWN"}</strong>
                    <small>TAG {captured.snapshot?.blockTag ?? "UNKNOWN"}</small>
                    <small>{formatTimestamp(captured.generatedAt)}</small>
                    <small>
                      {captured.status} · {captured.summary?.positionCount ?? "UNKNOWN"} position(s)
                    </small>
                    <small>
                      Universe {captured.universe?.status ?? "UNKNOWN"} · valuation coverage {captured.exposures?.coverage.valuationCoveragePct ?? "UNKNOWN"}% · block time {captured.snapshot?.blockTimestampStatus === "AVAILABLE" && captured.snapshot.blockTimestamp ? formatTimestamp(captured.snapshot.blockTimestamp) : "UNKNOWN"}
                    </small>
                  </>
                ) : (
                  <strong>NOT CAPTURED</strong>
                )}
              </article>
            );
          })}
        </div>

        {comparisonError && (
          <div className="tm-callout tm-callout-error tm-comparison-error">
            <span>COMPARISON UNAVAILABLE</span>
            <strong>{comparisonError}</strong>
          </div>
        )}

        {displayedComparison && (
          <div className="tm-comparison-result">
            <div className="tm-comparison-summary">
              <div>
                <span>RESULT</span>
                <strong>{displayedComparison.changeSummary.replaceAll("_", " ")}</strong>
              </div>
              <div>
                <span>BLOCK ORDER</span>
                <strong>
                  {displayedComparison.order.status} · Δ {displayedComparison.order.blockDelta}
                </strong>
              </div>
              <div>
                <span>COMPARABLE VALUE Δ</span>
                <strong>
                  {signedEvidence(
                    displayedComparison.valueComparison
                      .signedIndicativeValueDeltaUsd,
                    " USD",
                  )}
                </strong>
              </div>
              <div>
                <span>COMPARABLE COVERAGE</span>
                <strong>
                  {displayedComparison.valueComparison.comparablePositionCount}/
                  {displayedComparison.coverage.candidateContractCount} position(s)
                </strong>
              </div>
              <div>
                <span>OBSERVED DATA DIFFERENCES</span>
                <strong>
                  {displayedComparison.coverage.observedDataDifferenceCount} position(s) · {displayedComparison.coverage.changedPositionCount} balance change(s)
                </strong>
              </div>
            </div>

            <p className="tm-comparison-disclaimer">
              Snapshot totals remain separate: A known value {formatUsd(
                displayedComparison.snapshots.A.knownIndicativeValueUsd,
              )} ({displayedComparison.snapshots.A.valuationCoveragePct ?? "UNKNOWN"}% coverage), B known value {formatUsd(
                displayedComparison.snapshots.B.knownIndicativeValueUsd,
              )} ({displayedComparison.snapshots.B.valuationCoveragePct ?? "UNKNOWN"}% coverage). The comparable delta above includes only exact wrapper positions with evidence on both sides.
            </p>

            <div className="tm-exposure-breakdown">
              <div className="tm-exposure-breakdown-head">
                <span>PER UNDERLYING</span>
                <small>Verified identity only · comparable wrappers only</small>
              </div>
              {displayedComparison.underlyings.length === 0 ? (
                <div className="tm-empty-holdings">
                  <strong>No comparable verified-underlying exposure.</strong>
                </div>
              ) : (
                <div className="tm-comparison-grid">
                  {displayedComparison.underlyings.map((item) => (
                    <article key={item.identity}>
                      <div>
                        <strong>{item.ticker}</strong>
                        <em data-state={item.status}>{item.status}</em>
                      </div>
                      <small>{item.identity}</small>
                      <dl>
                        <div>
                          <dt>SHARES A → B</dt>
                          <dd>
                            {item.underlyingEquivalentSharesA ?? "UNKNOWN"} → {item.underlyingEquivalentSharesB ?? "UNKNOWN"}
                          </dd>
                        </div>
                        <div>
                          <dt>SHARE Δ</dt>
                          <dd>{signedEvidence(item.signedUnderlyingEquivalentShareDelta)}</dd>
                        </div>
                        <div>
                          <dt>VALUE A → B</dt>
                          <dd>
                            {item.comparableIndicativeValueUsdA} → {item.comparableIndicativeValueUsdB} USD
                          </dd>
                        </div>
                        <div>
                          <dt>COMPARABLE VALUE Δ</dt>
                          <dd>{signedEvidence(item.signedComparableIndicativeValueDeltaUsd, " USD")}</dd>
                        </div>
                        <div>
                          <dt>WRAPPERS</dt>
                          <dd>{item.positionKeys.length}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="tm-exposure-breakdown">
              <div className="tm-exposure-breakdown-head">
                <span>PER CONTRACT</span>
                <small>No BUY / SELL / transfer inference</small>
              </div>
              {displayedComparison.positions.length === 0 ? (
                <div className="tm-empty-holdings">
                  <strong>NO OBSERVED CHANGE</strong>
                  <p>No positive or unknown wrapper position required comparison.</p>
                </div>
              ) : (
                <div className="tm-comparison-grid">
                  {displayedComparison.positions.map((item) => (
                    <article key={item.positionKey}>
                      <div>
                        <strong>{item.symbol ?? "UNKNOWN WRAPPER"}</strong>
                        <em data-state={item.change}>{item.change}</em>
                      </div>
                      <small title={item.contractAddress}>
                        {item.chainId} · {compactAddress(item.contractAddress)}
                      </small>
                      <dl>
                        <div>
                          <dt>TOKEN QUANTITY Δ</dt>
                          <dd>{signedEvidence(item.quantity.signedTokenQuantityDelta)}</dd>
                        </div>
                        <div>
                          <dt>EQUIVALENT SHARE Δ</dt>
                          <dd>{signedEvidence(item.equivalence.signedUnderlyingEquivalentShareDelta)}</dd>
                        </div>
                        <div>
                          <dt>INDICATIVE VALUE Δ</dt>
                          <dd>{signedEvidence(item.valuation.signedIndicativeValueDeltaUsd, " USD")}</dd>
                        </div>
                      </dl>
                      <small>
                        Balance A/B {item.balance.A.state} {item.balance.A.rawBaseUnits ?? "UNKNOWN"} → {item.balance.B.state} {item.balance.B.rawBaseUnits ?? "UNKNOWN"}
                      </small>
                      <small>
                        Quantity A/B {item.quantity.tokenQuantityA ?? "UNKNOWN"} → {item.quantity.tokenQuantityB ?? "UNKNOWN"}
                      </small>
                      <small>
                        Ratio A/B {item.equivalence.tokenShareRatioA ?? "UNKNOWN"} → {item.equivalence.tokenShareRatioB ?? "UNKNOWN"} · Price A/B {item.valuation.tokenPriceUsdA ?? "UNKNOWN"} → {item.valuation.tokenPriceUsdB ?? "UNKNOWN"} USD
                      </small>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="tm-comparison-warnings">
              {displayedComparison.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && (
        <section className="tm-shell">
          <div className="tm-callout tm-callout-error">
            <span>{displayedResult?.status ?? "REQUEST FAILED"}</span>
            <strong>{error}</strong>
            <small>
              Unknown and failed balance reads are excluded from totals; they
              are never displayed as zero.
            </small>
          </div>
        </section>
      )}

      {displayedResult && (
        <>
          <section className="tm-shell tm-portfolio-overview">
            <div className="tm-section-head">
              <div>
                <span>PORTFOLIO OVERVIEW · BNB SMART CHAIN</span>
                <h2>{compactAddress(displayedResult.address)}</h2>
              </div>
              <span
                className="tm-portfolio-status"
                data-state={displayedResult.status}
              >
                {displayedResult.status}
              </span>
            </div>

            <div className="tm-portfolio-overview-grid">
              <div className="tm-portfolio-value">
                <span>{valuePresentation?.label}</span>
                <strong>
                  {valuePresentation?.value
                    ? formatUsd(valuePresentation.value)
                    : "UNKNOWN"}
                </strong>
                <small data-complete={valuePresentation?.complete}>
                  {valuePresentation?.note}
                </small>
              </div>
              <div>
                <span>POSITIVE WRAPPERS</span>
                <strong>
                  {displayedResult.summary?.positiveBalanceCount ?? "UNKNOWN"}
                </strong>
              </div>
              <div>
                <span>VERIFIED UNDERLYINGS</span>
                <strong>
                  {displayedResult.summary?.underlyingCount ?? "UNKNOWN"}
                </strong>
              </div>
              <div>
                <span>FAILED BALANCE READS</span>
                <strong>
                  {displayedResult.summary?.failedBalanceCount ?? "UNKNOWN"}
                </strong>
              </div>
              <div>
                <span>SNAPSHOT BLOCK</span>
                <strong>{displayedResult.snapshot?.blockNumber ?? "UNKNOWN"}</strong>
              </div>
              <div>
                <span>BLOCK TIME</span>
                <strong>
                  {displayedResult.snapshot?.blockTimestamp
                    ? formatTimestamp(displayedResult.snapshot.blockTimestamp)
                    : "UNKNOWN"}
                </strong>
              </div>
              <div>
                <span>GENERATED</span>
                <strong>{formatTimestamp(displayedResult.generatedAt)}</strong>
              </div>
              <div>
                <span>CHAIN</span>
                <strong>BSC · {displayedResult.chainId}</strong>
              </div>
            </div>
          </section>

          {failedChecks.length > 0 && (
            <section className="tm-shell">
              <div className="tm-callout tm-portfolio-warning">
                <span>INCOMPLETE WALLET EVIDENCE</span>
                <strong>
                  {failedChecks.length} wrapper balance read
                  {failedChecks.length === 1 ? " remains" : "s remain"} unknown.
                </strong>
                <small>
                  These contracts are not counted as zero and are excluded from
                  positions and portfolio valuation.
                </small>
              </div>
            </section>
          )}

          <section className="tm-shell tm-portfolio-section">
            <div className="tm-section-head tm-section-head-tight">
              <div>
                <span>VERIFIED UNDERLYING EXPOSURE</span>
                <h2>Economic positions</h2>
              </div>
              <small className="tm-portfolio-method">
                Exact source identity only · no symbol or name similarity
              </small>
            </div>

            {displayedResult.underlyingExposures.length === 0 ? (
              <div className="tm-empty-holdings">
                <strong>No verified underlying exposure is available.</strong>
                <p>
                  Positive wrappers without verified identity are not combined
                  into an underlying total.
                </p>
              </div>
            ) : (
              <div className="tm-exposure-grid">
                {displayedResult.underlyingExposures.map((exposure) => {
                  const shares =
                    exposure.underlyingEquivalentShares ??
                    (exposure.knownUnderlyingEquivalentShares === "0"
                      ? null
                      : exposure.knownUnderlyingEquivalentShares);
                  const exposureValue =
                    exposure.indicativeValueUsd ??
                    exposure.knownIndicativeValueUsd;
                  return (
                    <article className="tm-exposure-card" key={exposure.identity}>
                      <div className="tm-exposure-head">
                        <div>
                          <Link href={`/stock/${encodeURIComponent(exposure.ticker)}`}>
                            {exposure.ticker}
                          </Link>
                          <small>{exposure.name ?? exposure.identity}</small>
                        </div>
                        <em data-state={exposure.status}>{exposure.status}</em>
                      </div>
                      <div className="tm-exposure-metrics">
                        <div>
                          <span>
                            {exposure.underlyingEquivalentShares === null
                              ? "KNOWN EQUIVALENT SHARES"
                              : "EQUIVALENT SHARES"}
                          </span>
                          <strong>{formatNumber(shares)}</strong>
                        </div>
                        <div>
                          <span>
                            {exposure.indicativeValueUsd === null
                              ? "KNOWN INDICATIVE VALUE"
                              : "INDICATIVE VALUE"}
                          </span>
                          <strong>
                            {exposureValue === "0" && exposure.status === "PARTIAL"
                              ? "UNKNOWN"
                              : formatUsd(exposureValue)}
                          </strong>
                        </div>
                        <div>
                          <span>WRAPPERS</span>
                          <strong>{exposure.positionCount}</strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {displayedResult.exposures && (
            <section className="tm-shell tm-portfolio-section tm-exposure-intelligence">
              <div className="tm-section-head tm-section-head-tight">
                <div>
                  <span>EXPOSURE INTELLIGENCE · CURRENT SNAPSHOT</span>
                  <h2>Known-value breakdown</h2>
                </div>
                <small className="tm-portfolio-method">
                  Weights use known indicative value only · never unknown positions as zero
                </small>
              </div>

              <div className="tm-exposure-denominator">
                <div>
                  <span>WEIGHT DENOMINATOR</span>
                  <strong>
                    {displayedResult.exposures.denominator.status === "AVAILABLE"
                      ? formatUsd(
                          displayedResult.exposures.denominator
                            .knownIndicativeValueUsd,
                        )
                      : "UNKNOWN"}
                  </strong>
                </div>
                <div>
                  <span>VALUATION COVERAGE</span>
                  <strong>
                    {formatPct(
                      displayedResult.exposures.coverage.valuationCoveragePct,
                    )}
                  </strong>
                </div>
                <div>
                  <span>POSITIONS EXCLUDED FROM WEIGHTS</span>
                  <strong>
                    {displayedResult.exposures.coverage.unknownValuePositionCount}
                  </strong>
                </div>
                <p>
                  {displayedResult.exposures.coverage.unknownValuePositionCount > 0
                    ? "PARTIAL — every weight below is a share of known-valued positions, not the complete portfolio."
                    : displayedResult.exposures.denominator.status === "AVAILABLE"
                      ? "Complete current valuation coverage for detected positive positions."
                      : "No positive known-value denominator is available; allocation weights remain unknown."} Provider grouping is source provenance only—not issuer identity or evidence of legal rights. No historical P&amp;L, cost basis, or dividend entitlement is inferred without source data.
                </p>
              </div>

              <div className="tm-exposure-breakdown">
                <div className="tm-exposure-breakdown-head">
                  <span>BY UNDERLYING</span>
                  <small>Verified source identity only</small>
                </div>
                <div className="tm-exposure-intel-grid">
                  {displayedResult.exposures.byUnderlying.map((group) => (
                    <article className="tm-exposure-intel-card" key={group.identity}>
                      <div>
                        <strong>{group.ticker}</strong>
                        <small>{group.name ?? group.identity}</small>
                      </div>
                      <dl>
                        <div>
                          <dt>KNOWN VALUE</dt>
                          <dd>{formatUsd(group.knownIndicativeValueUsd)}</dd>
                        </div>
                        <div>
                          <dt>KNOWN-VALUE WEIGHT</dt>
                          <dd>{formatPct(group.knownValueWeightPct)}</dd>
                        </div>
                        <div>
                          <dt>COVERAGE</dt>
                          <dd>
                            {group.coverage.knownValuePositionCount}/
                            {group.coverage.totalPositionCount} valued
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>

              <div className="tm-exposure-breakdown">
                <div className="tm-exposure-breakdown-head">
                  <span>BY WRAPPER</span>
                  <small>Exact chain + contract identity</small>
                </div>
                <div className="tm-exposure-intel-grid">
                  {displayedResult.exposures.byWrapper.map((group) => (
                    <article className="tm-exposure-intel-card" key={group.identity}>
                      <div>
                        <strong>{group.symbol}</strong>
                        <small title={group.contractAddress}>
                          {group.chainId} · {compactAddress(group.contractAddress)}
                        </small>
                      </div>
                      <dl>
                        <div>
                          <dt>KNOWN VALUE</dt>
                          <dd>{formatUsd(group.knownIndicativeValueUsd)}</dd>
                        </div>
                        <div>
                          <dt>KNOWN-VALUE WEIGHT</dt>
                          <dd>{formatPct(group.knownValueWeightPct)}</dd>
                        </div>
                        <div>
                          <dt>COVERAGE</dt>
                          <dd>
                            {group.coverage.knownValuePositionCount}/
                            {group.coverage.totalPositionCount} valued
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>

              <div className="tm-exposure-breakdown">
                <div className="tm-exposure-breakdown-head">
                  <span>BY PROVIDER</span>
                  <small>Source provider identity · no issuer inference</small>
                </div>
                <div className="tm-exposure-intel-grid">
                  {displayedResult.exposures.byProvider.map((group) => (
                    <article className="tm-exposure-intel-card" key={group.identity}>
                      <div>
                        <strong>{providerLabel(group.provider)}</strong>
                        <small>{group.positionCount} exact wrapper position(s)</small>
                      </div>
                      <dl>
                        <div>
                          <dt>KNOWN VALUE</dt>
                          <dd>{formatUsd(group.knownIndicativeValueUsd)}</dd>
                        </div>
                        <div>
                          <dt>KNOWN-VALUE WEIGHT</dt>
                          <dd>{formatPct(group.knownValueWeightPct)}</dd>
                        </div>
                        <div>
                          <dt>COVERAGE</dt>
                          <dd>
                            {group.coverage.knownValuePositionCount}/
                            {group.coverage.totalPositionCount} valued
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section className="tm-shell tm-portfolio-section tm-wallet-results">
            <div className="tm-section-head">
              <div>
                <span>WRAPPER POSITIONS · WALLET INSPECTOR</span>
                <h2>Source-backed balances</h2>
              </div>
              <div className="tm-readonly-badge">
                <i />
                RPC READ ONLY
              </div>
            </div>

            {displayedResult.positions.length === 0 ? (
              <div className="tm-empty-holdings">
                <strong>
                  {failedChecks.length
                    ? "No positive position could be established from the available reads."
                    : "No matching non-zero tokenized-equity holdings."}
                </strong>
                <p>
                  {failedChecks.length
                    ? "Some balances remain unknown, so this is not proof of an empty portfolio."
                    : "All validated wrapper reads returned zero. This does not describe other wallet assets."}
                </p>
              </div>
            ) : (
              <div className="tm-position-grid">
                {displayedResult.positions.map((position) => {
                  const continuityHref = buildContinuityHref({
                    ticker: position.underlying.ticker,
                    contractAddress: position.wrapper.contractAddress,
                    tokenQuantity: position.balance.quantity,
                    identityStatus: position.underlying.evidence.status,
                  });
                  return (
                    <article
                      className="tm-position-card"
                      key={`${position.wrapper.chainId}:${position.wrapper.contractAddress}`}
                    >
                      <div className="tm-position-head">
                        <div>
                          <span>{providerLabel(position.wrapper.provider)}</span>
                          <strong>{position.wrapper.symbol}</strong>
                          <small title={position.wrapper.contractAddress}>
                            {compactAddress(position.wrapper.contractAddress)}
                          </small>
                        </div>
                        {position.underlying.ticker ? (
                          <Link
                            href={`/stock/${encodeURIComponent(position.underlying.ticker)}`}
                          >
                            {position.underlying.ticker} ↗
                          </Link>
                        ) : (
                          <em>IDENTITY UNKNOWN</em>
                        )}
                      </div>

                      <div className="tm-position-metrics">
                        <div>
                          <span>TOKEN QUANTITY</span>
                          <strong>{formatNumber(position.balance.quantity)}</strong>
                          <small>{position.balance.quantityStatus}</small>
                        </div>
                        <div>
                          <span>TOKEN / SHARE RATIO</span>
                          <strong>{formatNumber(position.equivalence.tokenShareRatio)}</strong>
                          <small>{position.equivalence.status}</small>
                        </div>
                        <div>
                          <span>UNDERLYING SHARES</span>
                          <strong>
                            {formatNumber(position.equivalence.underlyingEquivalentShares)}
                          </strong>
                          <small>{position.equivalence.status}</small>
                        </div>
                        <div>
                          <span>INDICATIVE VALUE</span>
                          <strong>{formatUsd(position.valuation.indicativeValueUsd)}</strong>
                          <small>{position.valuation.status}</small>
                        </div>
                        <div>
                          <span>MARKET SESSION</span>
                          <strong>{marketSession(position)}</strong>
                          <small>{position.evidence.marketSession.status}</small>
                        </div>
                        <div>
                          <span>ACTIONGUARD</span>
                          <strong>{position.actionGuard?.status ?? "UNKNOWN"}</strong>
                          <small>{position.actionGuard?.reason ?? "No reason supplied"}</small>
                        </div>
                        <div>
                          <span>INTEGRITY</span>
                          <strong>{position.integrity.status}</strong>
                          <small>{position.integrity.dataCompleteness}</small>
                        </div>
                        <div>
                          <span>RAW BALANCE</span>
                          <strong>{position.balance.rawBaseUnits}</strong>
                          <small>{position.balance.source}</small>
                        </div>
                      </div>

                      <div className="tm-position-evidence">
                        {Object.entries(position.evidence.sources).map(([name, evidence]) => (
                          <span
                            key={name}
                            data-tone={evidenceTone(evidence.status)}
                            title={evidence.reason ?? evidence.source}
                          >
                            {name.toUpperCase()} · {evidence.status}
                          </span>
                        ))}
                      </div>

                      <div className="tm-position-actions">
                        {continuityHref ? (
                          <Link href={continuityHref}>INSPECT CONTINUITY</Link>
                        ) : (
                          <span>CONTINUITY CONTEXT UNAVAILABLE</span>
                        )}
                        <small>Opens stock detail only. Continuity remains user-triggered.</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="tm-wallet-proof">
              <span>
                RPC METHODS · {displayedResult.readOnly.rpcMethods.join(" · ") || "NONE"}
              </span>
              <span>
                TRANSACTION METHODS · {displayedResult.readOnly.transactionMethods.length
                  ? displayedResult.readOnly.transactionMethods.join(" · ")
                  : "NONE"}
              </span>
              <span>
                QUOTE · {displayedResult.readOnly.quoteRequested ? "REQUESTED" : "NOT REQUESTED"}
              </span>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
