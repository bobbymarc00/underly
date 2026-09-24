"use client";

import { useMemo, useState } from "react";
import type { FirewallResponse, FindingSeverity, WrapperResult } from "@/lib/ui/response-types";
import {
  compactAddress,
  formatNumber,
  formatPct,
  formatTimestamp,
  formatUsd,
  methodologyLabel,
  providerLabel,
} from "@/lib/ui/format";

function toneForSeverity(severity: FindingSeverity): string {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  if (severity === "info") return "info";
  return "unknown";
}

function routeState(route: WrapperResult["execution"]["entry"]): string {
  if (!route.attempted) return "Not probed";
  if (route.available === true) return route.vendor ? `Available · ${route.vendor}` : "Available";
  if (route.available === false) return route.errorCode ? `Unavailable · ${route.errorCode}` : "Unavailable";
  return "Unknown";
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function actionTone(status: WrapperResult["corporateActions"]["status"]): string {
  if (status === "CLEAR") return "clear";
  if (status === "ACTIVE") return "critical";
  return "unknown";
}

function integrityTone(status: WrapperResult["integrity"]["status"]): string {
  if (status === "PASS") return "clear";
  if (status === "WARN") return "warning";
  return "unknown";
}

function tradingTone(value: boolean | null): string {
  if (value === true) return "clear";
  if (value === false) return "warning";
  return "unknown";
}

function tradingLabel(value: boolean | null): string {
  if (value === true) return "Trading available";
  if (value === false) return "Trading unavailable";
  return "Trading state unknown";
}

function ExecutionLeg({ name, leg }: { name: string; leg: WrapperResult["execution"]["breakdown"]["entry"] }) {
  if (!leg) {
    return (
      <div className="execution-leg muted-leg">
        <span>{name}</span>
        <strong>Not applicable</strong>
      </div>
    );
  }

  return (
    <div className="execution-leg">
      <div className="execution-leg-head">
        <span>{name}</span>
        <strong>{formatPct(leg.frictionPct)}</strong>
      </div>
      <div className="mini-meter" aria-hidden="true">
        <i style={{ width: `${Math.max(2, Math.min(100, Number(leg.frictionPct) || 0))}%` }} />
      </div>
      <div className="execution-leg-values">
        <span>{formatUsd(leg.benchmarkValueUsd)} benchmark</span>
        <span>{formatUsd(leg.quotedValueUsd)} quoted</span>
      </div>
    </div>
  );
}

function WrapperCard({ wrapper, intent }: { wrapper: WrapperResult; intent: FirewallResponse["request"]["intent"] }) {
  const execution = wrapper.execution;
  const noExecution = execution.methodology === "NOT_APPLICABLE";
  const [copiedAddress, setCopiedAddress] = useState(false);
  const frictionFinding = wrapper.findings.find((finding) => finding.code === "HIGH_EXECUTION_FRICTION");
  const frictionTone = frictionFinding ? toneForSeverity(frictionFinding.severity) : "neutral";

  async function copyAddress() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(wrapper.identity.contractAddress);
    setCopiedAddress(true);
    window.setTimeout(() => setCopiedAddress(false), 1400);
  }

  return (
    <article className="wrapper-card">
      <header className="wrapper-card-head">
        <div>
          <span className="provider-label">{providerLabel(wrapper.identity.platform)}</span>
          <h3>{wrapper.identity.symbol}</h3>
          <button
            className="copy-address"
            title={wrapper.identity.contractAddress}
            onClick={copyAddress}
            type="button"
          >
            {compactAddress(wrapper.identity.contractAddress)} · {copiedAddress ? "copied" : "copy"}
          </button>
        </div>
        <div className="wrapper-states">
          <StatusPill tone={actionTone(wrapper.corporateActions.status)}>
            ActionGuard {wrapper.corporateActions.status}
          </StatusPill>
          <StatusPill tone={integrityTone(wrapper.integrity.status)}>
            Integrity {wrapper.integrity.status}
          </StatusPill>
        </div>
      </header>

      <div className="metric-grid">
        <div className="metric">
          <span>Token price</span>
          <strong>{formatUsd(wrapper.market.tokenPriceUsd)}</strong>
        </div>
        <div className="metric">
          <span>Reference</span>
          <strong>{formatUsd(wrapper.market.referencePriceUsd)}</strong>
        </div>
        <div className="metric">
          <span>Reference gap</span>
          <strong>{formatPct(wrapper.market.referenceGapPct)}</strong>
        </div>
        <div className="metric">
          <span>Token / share</span>
          <strong title={wrapper.identity.tokenShareRatio ?? "Unknown"}>{formatNumber(wrapper.identity.tokenShareRatio)}</strong>
        </div>
      </div>

      <section className="card-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">MARKET</span>
            <h4>{tradingLabel(wrapper.market.session.tradingAvailable)}</h4>
          </div>
          <StatusPill tone={tradingTone(wrapper.market.session.tradingAvailable)}>
            {wrapper.market.session.status ? `Session ${wrapper.market.session.status}` : "Session label unknown"}
          </StatusPill>
        </div>
        <div className="detail-row"><span>Session label</span><strong>{wrapper.market.session.status ?? "Unknown"}</strong></div>
        <div className="detail-row"><span>Reason</span><strong>{wrapper.market.session.reasonCode ?? "None reported"}</strong></div>
        <div className="detail-row"><span>Price observed</span><strong>{formatTimestamp(wrapper.market.tokenPriceUpdatedAt)}</strong></div>
      </section>

      <section className="card-section execution-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">EXECUTION LENS</span>
            <h4>{methodologyLabel(execution.methodology)}</h4>
          </div>
          {execution.currentHaircutPct !== null && (
            <StatusPill tone={frictionTone}>{formatPct(execution.currentHaircutPct)} friction</StatusPill>
          )}
        </div>

        {noExecution ? (
          <div className="empty-execution">
            <strong>No execution probe by design.</strong>
            <span>HOLD does not manufacture an entry or exit route.</span>
          </div>
        ) : (
          <>
            <div className="route-row">
              <div><span>Entry route</span><strong>{routeState(execution.entry)}</strong></div>
              <div><span>Exit route</span><strong>{routeState(execution.exit)}</strong></div>
            </div>
            <div className="execution-legs">
              <ExecutionLeg name="Entry" leg={execution.breakdown.entry} />
              <ExecutionLeg name="Exit" leg={execution.breakdown.exit} />
              {intent === "BUY" && <ExecutionLeg name="Round trip" leg={execution.breakdown.roundTrip} />}
            </div>
            <div className="detail-row"><span>Quantity source</span><strong>{execution.quantitySource?.replaceAll("_", " ") ?? "Unknown"}</strong></div>
            <div className="detail-row"><span>Token amount</span><strong>{formatNumber(execution.tokenAmount)}</strong></div>
          </>
        )}
      </section>

      <section className="card-section valuation-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">CONSERVATIVE VALUE</span>
            <h4>{wrapper.valuation ? formatUsd(wrapper.valuation.conservativeValueUsd) : "Not applicable"}</h4>
          </div>
          {wrapper.valuation && <StatusPill>{wrapper.valuation.basis.join(" · ")}</StatusPill>}
        </div>
        {wrapper.valuation ? (
          <div className="valuation-grid">
            <div><span>Displayed</span><strong>{formatUsd(wrapper.valuation.displayedValueUsd)}</strong></div>
            <div><span>Reference-adjusted</span><strong>{formatUsd(wrapper.valuation.referenceAdjustedValueUsd)}</strong></div>
            <div><span>Executable</span><strong>{formatUsd(wrapper.valuation.executableValueUsd)}</strong></div>
          </div>
        ) : (
          <p className="quiet-copy">No position size was supplied, so Underly does not manufacture a valuation.</p>
        )}
      </section>

      <section className="card-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">ASSET PASSPORT</span>
            <h4>{wrapper.passport.dataCompleteness === "COMPLETE" ? "Metadata complete" : "Metadata partial"}</h4>
          </div>
          <StatusPill tone={wrapper.passport.dataCompleteness === "COMPLETE" ? "clear" : "unknown"}>{wrapper.passport.dataCompleteness}</StatusPill>
        </div>
        <div className="detail-row"><span>Daily attestation</span><strong>{wrapper.passport.attestation.daily}</strong></div>
        <div className="detail-row"><span>Monthly attestation</span><strong>{wrapper.passport.attestation.monthly}</strong></div>
        <div className="detail-row"><span>Decimals</span><strong>{wrapper.identity.tokenDecimals ?? "Unknown"}</strong></div>
      </section>

      <section className="card-section findings-section">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">DETERMINISTIC FINDINGS</span>
            <h4>{wrapper.findings.length ? `${wrapper.findings.length} finding${wrapper.findings.length === 1 ? "" : "s"}` : "No triggered findings"}</h4>
          </div>
        </div>
        <div className="finding-list">
          {wrapper.findings.length === 0 && <div className="quiet-copy">No deterministic rule triggered for this wrapper in this snapshot.</div>}
          {wrapper.findings.map((finding) => (
            <div className={`finding ${toneForSeverity(finding.severity)}`} key={finding.code}>
              <span>{finding.severity}</span>
              <div><strong>{finding.title}</strong><p>{finding.message}</p></div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function ComparisonTable({ wrappers }: { wrappers: WrapperResult[] }) {
  const minWidth = Math.max(820, 250 + wrappers.length * 250);

  return (
    <section className="comparison-block">
      <div className="comparison-heading">
        <div>
          <span className="kicker">WRAPPER MATRIX</span>
          <h2>Same underlying. Different wrapper reality.</h2>
        </div>
        <span className="matrix-note">Every wrapper returned by Binance Web3 is compared independently.</span>
      </div>
      <div className="comparison-scroll">
        <table className="comparison-table" style={{ minWidth }}>
          <thead>
            <tr>
              <th>Metric</th>
              {wrappers.map((wrapper) => (
                <th key={wrapper.identity.contractAddress}>
                  <span>{providerLabel(wrapper.identity.platform)}</span>
                  <strong>{wrapper.identity.symbol}</strong>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><td>Token price</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{formatUsd(w.market.tokenPriceUsd)}</td>)}</tr>
            <tr><td>Reference</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{formatUsd(w.market.referencePriceUsd)}</td>)}</tr>
            <tr><td>Reference gap</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{formatPct(w.market.referenceGapPct)}</td>)}</tr>
            <tr><td>Trading</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{tradingLabel(w.market.session.tradingAvailable)}</td>)}</tr>
            <tr><td>Session label</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{w.market.session.status ?? "Unknown"}</td>)}</tr>
            <tr><td>Execution</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{methodologyLabel(w.execution.methodology)}</td>)}</tr>
            <tr><td>Executable value</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{formatUsd(w.execution.executableValueUsd)}</td>)}</tr>
            <tr><td>Conservative value</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{w.valuation ? formatUsd(w.valuation.conservativeValueUsd) : "N/A"}</td>)}</tr>
            <tr><td>ActionGuard</td>{wrappers.map((w) => <td key={w.identity.contractAddress}><StatusPill tone={actionTone(w.corporateActions.status)}>{w.corporateActions.status}</StatusPill></td>)}</tr>
            <tr><td>Findings</td>{wrappers.map((w) => <td key={w.identity.contractAddress}>{w.findings.length ? w.findings.length : "No findings"}</td>)}</tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProofDrawer({ result }: { result: FirewallResponse }) {
  const [open, setOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  async function copyHash() {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(result.proof.dataHash);
    setCopiedHash(true);
    window.setTimeout(() => setCopiedHash(false), 1400);
  }

  return (
    <details
      className="proof-drawer"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          <span className="kicker">EVIDENCE RECEIPT</span>
          <strong>Sources + Underly Proof</strong>
        </span>
        <span>{open ? "Close evidence ↗" : "Open evidence ↘"}</span>
      </summary>
      <div className="proof-content">
        <div className="proof-block">
          <div className="detail-row"><span>Request ID</span><strong className="mono-value">{result.requestId}</strong></div>
          <div className="detail-row"><span>Schema</span><strong className="mono-value">{result.proof.schemaVersion}</strong></div>
          <div className="detail-row"><span>Proof ID</span><strong className="mono-value">{result.proof.proofId}</strong></div>
          <div className="hash-row">
            <span>SHA-256 data hash</span>
            <code>{result.proof.dataHash}</code>
            <button type="button" onClick={copyHash}>{copiedHash ? "Copied" : "Copy hash"}</button>
          </div>
        </div>

        <div className="source-grid">
          {result.wrappers.map((wrapper) => (
            <div className="source-card" key={wrapper.identity.contractAddress}>
              <strong>{providerLabel(wrapper.identity.platform)} · {wrapper.identity.symbol}</strong>
              {wrapper.sources.map((source, index) => (
                <div className="source-row" key={`${source.endpoint}-${index}`}>
                  <span>{source.endpoint}</span>
                  <span>{source.upstreamCode === undefined ? "observed" : `code ${source.upstreamCode}`}</span>
                  <small>{formatTimestamp(source.observedAt)}</small>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

interface ProviderFilterState {
  activeProvider: string;
  providerSignature: string;
}

export function reconcileProviderFilter(
  state: ProviderFilterState,
  providers: string[],
): ProviderFilterState {
  const providerSignature = providers.join("\u0000");
  if (state.providerSignature === providerSignature) return state;

  return {
    activeProvider:
      state.activeProvider === "ALL" || providers.includes(state.activeProvider)
        ? state.activeProvider
        : "ALL",
    providerSignature,
  };
}

export function ResultView({ result }: { result: FirewallResponse }) {
  const providers = useMemo(
    () => Array.from(new Set(result.wrappers.map((wrapper) => wrapper.identity.platform))),
    [result],
  );
  const providerSignature = providers.join("\u0000");
  const [providerFilter, setProviderFilter] = useState<ProviderFilterState>({
    activeProvider: "ALL",
    providerSignature,
  });
  const reconciledFilter = reconcileProviderFilter(providerFilter, providers);
  if (reconciledFilter !== providerFilter) {
    setProviderFilter(reconciledFilter);
  }
  const activeProvider = reconciledFilter.activeProvider;

  function selectProvider(nextProvider: string) {
    setProviderFilter({
      activeProvider: nextProvider,
      providerSignature,
    });
  }

  const visible = activeProvider === "ALL"
    ? result.wrappers
    : result.wrappers.filter((wrapper) => wrapper.identity.platform === activeProvider);

  const counts = result.wrappers.reduce(
    (acc, wrapper) => {
      for (const finding of wrapper.findings) acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, unknown: 0 } as Record<FindingSeverity, number>,
  );

  return (
    <section className="result-shell" id="results">
      <header className="result-hero">
        <div>
          <span className="kicker">LIVE UNDERLY SNAPSHOT · v{result.version}</span>
          <h1>{result.underlying.ticker}</h1>
          <p>{result.underlying.name}</p>
        </div>
        <div className="result-meta">
          <div><span>Wrappers</span><strong>{result.wrappers.length}</strong></div>
          <div><span>Intent</span><strong>{result.request.intent}</strong></div>
          <div><span>Checked</span><strong>{formatTimestamp(result.checkedAt)}</strong></div>
        </div>
      </header>

      <div className="finding-summary">
        <span><i className="dot critical" />{counts.critical} critical</span>
        <span><i className="dot warning" />{counts.warning} warning</span>
        <span><i className="dot unknown" />{counts.unknown} unknown</span>
        <span className="summary-note">Counts are deterministic findings, not a safety score.</span>
      </div>

      <ComparisonTable wrappers={result.wrappers} />

      <div className="provider-filter">
        <span>Inspect cards</span>
        <button type="button" data-active={activeProvider === "ALL"} onClick={() => selectProvider("ALL")}>All wrappers</button>
        {providers.map((provider) => (
          <button type="button" key={provider} data-active={activeProvider === provider} onClick={() => selectProvider(provider)}>
            {providerLabel(provider)}
          </button>
        ))}
      </div>

      <div className="wrapper-grid">
        {visible.map((wrapper) => (
          <WrapperCard key={wrapper.identity.contractAddress} wrapper={wrapper} intent={result.request.intent} />
        ))}
      </div>

      <ProofDrawer result={result} />
    </section>
  );
}
