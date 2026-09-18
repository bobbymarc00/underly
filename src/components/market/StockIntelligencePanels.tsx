"use client";

import { useEffect, useMemo, useState } from "react";

import { providerLabel } from "@/lib/ui/format";

type PanelState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";

interface LiquidityRouteView {
  attempted: boolean;
  available: boolean;
  vendor: string | null;
  executionMode: string | null;
  priceImpactPercent: string | null;
  tradeFee: string | null;
  estimateGasFee: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}

interface LiquidityLeg {
  benchmarkValueUsd: string;
  quotedValueUsd: string;
  frictionUsd: string;
  frictionPct: string;
  favorableDeltaUsd: string | null;
}

interface LiquidityProbe {
  state: PanelState;
  benchmarkNotionalUsd: string;
  tokenAmount: string | null;
  entry: LiquidityRouteView;
  exit: LiquidityRouteView;
  entryMark: LiquidityLeg | null;
  exitFromMark: LiquidityLeg | null;
  roundTrip: LiquidityLeg | null;
  executableValueUsd: string | null;
  quoteTimestamp: string;
}

interface LiquidityPayload {
  version: string;
  generatedAt: string;
  ticker: string;
  status: PanelState;
  benchmarkNotionalUsd: string;
  summary: {
    wrapperCount: number;
    available: number;
    partial: number;
    unavailable: number;
  };
  wrappers: Array<{
    provider: string;
    symbol: string;
    contractAddress: string;
    market: {
      tokenPriceUsd: string | null;
      referencePriceUsd: string | null;
      reportedVolume24H: string | null;
      reportedVolume24HComparability: string;
      session: {
        tradingAvailable: boolean | null;
        status: string | null;
        reasonCode: string | null;
        reasonMessage: string | null;
      };
    };
    probe: LiquidityProbe;
    sources: {
      tokenList: {
        endpoint: string;
        upstreamCode: number | null;
        upstreamMessage: string | null;
      };
      price: {
        endpoint: string;
        upstreamCode: number | null;
        upstreamMessage: string | null;
      };
      quote: {
        endpoint: string;
        observedAt: string;
      };
    };
  }>;
}

interface EvidenceResolution {
  value: string | null;
  status: "CONSENSUS" | "SINGLE_SOURCE" | "CONFLICT" | "UNKNOWN";
  evidence: Array<{
    provider: string;
    symbol: string;
    value: string;
  }>;
}

interface CorporateActionsPayload {
  version: string;
  generatedAt: string;
  ticker: string;
  state: PanelState;
  currentStatus: {
    agreement: "CONSENSUS" | "CONFLICT" | "UNKNOWN";
    status: "CLEAR" | "ACTIVE" | "UNKNOWN" | null;
    wrapperStatuses: Array<{
      provider: string;
      symbol: string;
      status: "CLEAR" | "ACTIVE" | "UNKNOWN";
    }>;
  };
  dividendSnapshot: {
    latestDividend: EvidenceResolution;
    dividendYield: EvidenceResolution;
    dividendYieldPercent: EvidenceResolution;
    normalization: {
      status: string;
      unit: string;
      note: string;
    };
  };
  currentEvents: Array<{
    provider: string;
    symbol: string;
    type: string;
    status: string;
    reasonCode: string | null;
    reasonMessage: string | null;
    observedAt: string;
    temporalSemantics: string;
  }>;
  wrappers: Array<{
    provider: string;
    symbol: string;
    contractAddress: string;
    sourceState: "AVAILABLE" | "UNAVAILABLE";
    marketSession: {
      tradingAvailable: boolean | null;
      status: string | null;
      reasonCode: string | null;
      reasonMessage: string | null;
      nextOpenAt: number | null;
      nextCloseAt: number | null;
    } | null;
    actionGuard: {
      activeIssue: boolean | null;
      status: "CLEAR" | "ACTIVE" | "UNKNOWN";
      events: Array<{
        type: string;
        status: string;
        reasonCode: string | null;
        reasonMessage: string | null;
      }>;
      reason: string | null;
      source: string;
    } | null;
    source: {
      endpoint: string;
      upstreamCode: number | null;
      upstreamMessage: string | null;
    };
  }>;
}

interface CorporateHistoryEvent {
  eventKey: string;
  ticker: string;
  type: "DIVIDEND" | "STOCK_SPLIT";
  eventDate: string;
  dateSemantics: "EX_DIVIDEND_DATE" | "SPLIT_EFFECTIVE_DATE";
  dividend: {
    amountPerShare: string | null;
    declarationDate: string | null;
    exDividendDate: string;
    recordDate: string | null;
    paymentDate: string | null;
  } | null;
  split: {
    effectiveDate: string;
    factor: string | null;
  } | null;
  source: {
    provider: string;
    endpoint: string;
    symbol: string;
    retrievedAt: string;
    raw: Record<string, unknown>;
  };
}

interface CorporateHistoryPayload {
  version: string;
  generatedAt: string;
  ticker: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NOT_CONFIGURED";
  provider: string | null;
  asOfDate?: string;
  totalAvailableEvents?: number;
  returnedEvents?: number;
  truncated?: boolean;
  events: CorporateHistoryEvent[];
  note?: string;
  error?: string;
  cache: {
    state: "MISS" | "HIT";
    fetchedAt: string;
    expiresAt: string | null;
    reusable: boolean;
  } | null;
}

interface Finding {
  code: string;
  severity: "critical" | "warning" | "info" | "unknown";
  title: string;
  message: string;
  evidence?: Record<string, unknown>;
}

interface HoldProofPayload {
  version: string;
  requestId: string;
  checkedAt: string;
  request: {
    ticker: string | null;
    intent: "HOLD";
    amountUsd: string | null;
    tokenAmount: string | null;
    amountMeaning: string;
    positionInput: string;
    chainId: string;
  };
  wrappers: Array<{
    identity: {
      symbol: string;
      platform: string;
      chainId: string;
      contractAddress: string;
      tokenDecimals: number | string | null;
      tokenShareRatio: string | null;
    };
    passport: {
      provider: string;
      attestation: {
        daily: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
        monthly: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
        dailyUrl: string | null;
        monthlyUrl: string | null;
      };
      dataCompleteness: "COMPLETE" | "PARTIAL";
      missingFields: string[];
    };
    integrity: {
      tokenShareRatioKnown: boolean;
      referenceAvailable: boolean;
      attestationAvailable: boolean | null;
      status: "PASS" | "WARN" | "UNKNOWN";
    };
    corporateActions: {
      activeIssue: boolean | null;
      status: "CLEAR" | "ACTIVE" | "UNKNOWN";
      events: Array<{
        type: string;
        status: string;
        reasonCode: string | null;
        reasonMessage: string | null;
      }>;
      reason: string | null;
      source: string;
    };
    findings: Finding[];
    sources: Array<{
      provider: string;
      endpoint: string;
      observedAt: string;
      upstreamCode?: number;
      upstreamMessage?: string;
    }>;
  }>;
  proof: {
    proofId: string;
    schemaVersion: string;
    generatedAt: string;
    dataHash: string;
  };
}

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

function initialLoad<T>(): LoadState<T> {
  return { data: null, error: null, loading: true };
}

function tone(value: string | null | undefined): "ok" | "warn" | "bad" | "neutral" {
  if (!value) return "neutral";
  if (
    value === "AVAILABLE" ||
    value === "CLEAR" ||
    value === "CONSENSUS" ||
    value === "PASS" ||
    value === "COMPLETE"
  ) {
    return "ok";
  }
  if (
    value === "PARTIAL" ||
    value === "SINGLE_SOURCE" ||
    value === "ACTIVE" ||
    value === "WARN"
  ) {
    return "warn";
  }
  if (
    value === "UNAVAILABLE" ||
    value === "CONFLICT" ||
    value === "critical"
  ) {
    return "bad";
  }
  return "neutral";
}

function money(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(parsed) < 10 ? 4 : 2,
  }).format(parsed);
}

function percent(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return `${value}%`;
  return `${parsed.toLocaleString("en-US", {
    maximumFractionDigits: 4,
  })}%`;
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function shortHash(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 30) return value;
  return `${value.slice(0, 18)}…${value.slice(-10)}`;
}

async function readJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
  });
  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }

  return body;
}

function PanelStateView({
  label,
  error,
}: {
  label: string;
  error: string | null;
}) {
  return (
    <div className="tm-intel-empty">
      <span>{error ? "SOURCE UNAVAILABLE" : "LOADING"}</span>
      <strong>{error ?? `Resolving ${label}…`}</strong>
    </div>
  );
}

export function StockIntelligencePanels({ ticker }: { ticker: string }) {
  const [liquidity, setLiquidity] =
    useState<LoadState<LiquidityPayload>>(initialLoad);
  const [actions, setActions] =
    useState<LoadState<CorporateActionsPayload>>(initialLoad);
  const [history, setHistory] =
    useState<LoadState<CorporateHistoryPayload>>(initialLoad);
  const [proof, setProof] = useState<HoldProofPayload | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setLiquidity(initialLoad());
    setActions(initialLoad());
    setHistory(initialLoad());
    setProof(null);
    setProofError(null);

    void readJson<LiquidityPayload>(
      `/api/liquidity?ticker=${encodeURIComponent(ticker)}&notionalUsd=1000`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setLiquidity({ data, error: null, loading: false });
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setLiquidity({
          data: null,
          error: caught instanceof Error ? caught.message : "Liquidity unavailable",
          loading: false,
        });
      });

    void readJson<CorporateActionsPayload>(
      `/api/corporate-actions?ticker=${encodeURIComponent(ticker)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setActions({ data, error: null, loading: false });
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setActions({
          data: null,
          error:
            caught instanceof Error
              ? caught.message
              : "Corporate-action status unavailable",
          loading: false,
        });
      });

    void readJson<CorporateHistoryPayload>(
      `/api/corporate-actions/history?ticker=${encodeURIComponent(ticker)}&limit=8`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) {
          setHistory({ data, error: null, loading: false });
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setHistory({
          data: null,
          error:
            caught instanceof Error
              ? caught.message
              : "Corporate-action history unavailable",
          loading: false,
        });
      });

    return () => controller.abort();
  }, [ticker]);

  const actionStatus = actions.data?.currentStatus.status ?? null;

  const actionSummary = useMemo(() => {
    if (!actions.data) return "Awaiting current wrapper status";
    if (actions.data.currentStatus.agreement === "CONFLICT") {
      return "Wrapper ActionGuard states conflict";
    }
    if (actionStatus === "ACTIVE") {
      return "Explicit corporate-action restriction detected";
    }
    if (actionStatus === "CLEAR") {
      return "No current corporate-action signal";
    }
    return "Current ActionGuard state is unknown";
  }, [actionStatus, actions.data]);

  async function generateHoldProof() {
    setProofLoading(true);
    setProofError(null);

    try {
      const data = await readJson<HoldProofPayload>("/api/firewall/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          intent: "HOLD",
        }),
      });
      setProof(data);
    } catch (caught) {
      setProof(null);
      setProofError(
        caught instanceof Error ? caught.message : "HOLD proof generation failed",
      );
    } finally {
      setProofLoading(false);
    }
  }

  return (
    <section className="tm-shell tm-intel">
      <div className="tm-section-head tm-section-head-tight">
        <div>
          <span>WRAPPER INTELLIGENCE</span>
          <h2>Wrapper intelligence</h2>
        </div>
        <p className="tm-intel-intro">
          Current provider-specific evidence. Missing or conflicting values
          remain explicit; no wrapper ranking is produced.
        </p>
      </div>

      <div className="tm-intel-grid">
        <article className="tm-intel-panel tm-intel-panel-wide">
          <div className="tm-intel-title">
            <div>
              <span>LIQUIDITY</span>
              <h3>Standardized $1,000 probe</h3>
            </div>
            <em data-tone={tone(liquidity.data?.status)}>
              {liquidity.data?.status ?? (liquidity.loading ? "LOADING" : "UNAVAILABLE")}
            </em>
          </div>

          {liquidity.loading || liquidity.error ? (
            <PanelStateView label="liquidity" error={liquidity.error} />
          ) : (
            <>
              <div className="tm-intel-metrics">
                <div>
                  <span>Wrappers</span>
                  <strong>{liquidity.data?.summary.wrapperCount ?? "—"}</strong>
                </div>
                <div>
                  <span>Available</span>
                  <strong>{liquidity.data?.summary.available ?? "—"}</strong>
                </div>
                <div>
                  <span>Partial</span>
                  <strong>{liquidity.data?.summary.partial ?? "—"}</strong>
                </div>
                <div>
                  <span>Unavailable</span>
                  <strong>{liquidity.data?.summary.unavailable ?? "—"}</strong>
                </div>
              </div>

              <div className="tm-intel-table-wrap">
                <table className="tm-intel-table">
                  <thead>
                    <tr>
                      <th>Wrapper</th>
                      <th>Probe</th>
                      <th>Round-trip friction</th>
                      <th>Executable value</th>
                      <th>Entry route</th>
                      <th>Exit route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidity.data?.wrappers.map((wrapper) => (
                      <tr key={wrapper.contractAddress}>
                        <td>
                          <strong>{wrapper.symbol}</strong>
                          <small>{providerLabel(wrapper.provider)}</small>
                        </td>
                        <td>
                          <em data-tone={tone(wrapper.probe.state)}>
                            {wrapper.probe.state}
                          </em>
                        </td>
                        <td>
                          <strong>
                            {percent(wrapper.probe.roundTrip?.frictionPct)}
                          </strong>
                          <small>
                            impact in{" "}
                            {percent(wrapper.probe.entry.priceImpactPercent)} · out{" "}
                            {percent(wrapper.probe.exit.priceImpactPercent)}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {money(wrapper.probe.executableValueUsd)}
                          </strong>
                          <small>
                            from {money(wrapper.probe.benchmarkNotionalUsd)}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {wrapper.probe.entry.vendor ?? "No route"}
                          </strong>
                          <small>
                            {wrapper.probe.entry.executionMode ??
                              wrapper.probe.entry.errorMessage ??
                              "—"}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {wrapper.probe.exit.vendor ?? "No route"}
                          </strong>
                          <small>
                            {wrapper.probe.exit.executionMode ??
                              wrapper.probe.exit.errorMessage ??
                              "—"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="tm-intel-note">
                Same benchmark notional for every wrapper. Reported 24H volume is
                intentionally not used to rank providers because cross-provider
                comparability is unverified.
              </p>
            </>
          )}
        </article>

        <article className="tm-intel-panel">
          <div className="tm-intel-title">
            <div>
              <span>ACTIONGUARD</span>
              <h3>Current wrapper status</h3>
            </div>
            <em data-tone={tone(actionStatus)}>
              {actionStatus ?? actions.data?.currentStatus.agreement ?? "UNKNOWN"}
            </em>
          </div>

          {actions.loading || actions.error ? (
            <PanelStateView
              label="ActionGuard"
              error={actions.error}
            />
          ) : (
            <>
              <div className="tm-action-hero">
                <strong>{actionSummary}</strong>
                <small>
                  Agreement: {actions.data?.currentStatus.agreement ?? "UNKNOWN"}
                </small>
              </div>

              <div className="tm-status-stack">
                {actions.data?.currentStatus.wrapperStatuses.map((wrapper) => (
                  <div key={`${wrapper.provider}-${wrapper.symbol}`}>
                    <span>
                      {providerLabel(wrapper.provider)} · {wrapper.symbol}
                    </span>
                    <strong data-tone={tone(wrapper.status)}>
                      {wrapper.status}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="tm-dividend-strip">
                <div>
                  <span>Latest dividend</span>
                  <strong>
                    {actions.data?.dividendSnapshot.latestDividend.value ?? "—"}
                  </strong>
                  <small
                    data-tone={tone(
                      actions.data?.dividendSnapshot.latestDividend.status,
                    )}
                  >
                    {actions.data?.dividendSnapshot.latestDividend.status ??
                      "UNKNOWN"}
                  </small>
                </div>
                <div>
                  <span>Yield normalized</span>
                  <strong>
                    {percent(
                      actions.data?.dividendSnapshot.dividendYieldPercent.value,
                    )}
                  </strong>
                  <small
                    data-tone={tone(
                      actions.data?.dividendSnapshot.dividendYieldPercent.status,
                    )}
                  >
                    {actions.data?.dividendSnapshot.dividendYieldPercent.status ??
                      "UNKNOWN"}
                  </small>
                </div>
              </div>

              {actions.data?.currentEvents.length ? (
                <div className="tm-current-events">
                  {actions.data.currentEvents.map((event, index) => (
                    <div key={`${event.provider}-${event.symbol}-${event.type}-${index}`}>
                      <strong>{event.type.replaceAll("_", " ")}</strong>
                      <span>
                        {providerLabel(event.provider)} · {event.symbol}
                      </span>
                      <small>
                        {event.reasonMessage ??
                          event.reasonCode ??
                          "Current explicit action signal"}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="tm-intel-note">
                  Ordinary market-closed sessions remain CLEAR and are not
                  manufactured into corporate-action events.
                </p>
              )}
            </>
          )}
        </article>

        <article className="tm-intel-panel">
          <div className="tm-intel-title">
            <div>
              <span>CORPORATE ACTIONS</span>
              <h3>Historical evidence</h3>
            </div>
            <em data-tone={tone(history.data?.status)}>
              {history.data?.status ?? (history.loading ? "LOADING" : "UNAVAILABLE")}
            </em>
          </div>

          {history.loading || history.error ? (
            <PanelStateView
              label="corporate-action history"
              error={history.error}
            />
          ) : history.data?.status === "NOT_CONFIGURED" ? (
            <div className="tm-intel-empty">
              <span>PROVIDER NOT CONFIGURED</span>
              <strong>{history.data.note ?? "Historical evidence unavailable"}</strong>
            </div>
          ) : history.data?.events.length ? (
            <div className="tm-event-list">
              {history.data.events.map((event) => (
                <div key={event.eventKey}>
                  <time>{dateLabel(event.eventDate)}</time>
                  <span>{event.type.replaceAll("_", " ")}</span>
                  <strong>
                    {event.type === "DIVIDEND"
                      ? event.dividend?.amountPerShare
                        ? `${event.dividend.amountPerShare} / share`
                        : "Amount unavailable"
                      : event.split?.factor ?? "Factor unavailable"}
                  </strong>
                  <small>
                    {event.source.provider} · {event.dateSemantics.replaceAll("_", " ")}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <div className="tm-intel-empty">
              <span>NO HISTORICAL EVENTS</span>
              <strong>
                No provider-backed dividend or split events in the returned
                history.
              </strong>
            </div>
          )}

          {history.data && history.data.status !== "NOT_CONFIGURED" && (
            <p className="tm-intel-note">
              Historical events are informational evidence only. They remain
              separate from current Binance ActionGuard semantics.
            </p>
          )}
        </article>

        <article className="tm-intel-panel tm-intel-panel-wide">
          <div className="tm-intel-title">
            <div>
              <span>FINDINGS + PROOF</span>
              <h3>On-demand HOLD snapshot</h3>
            </div>
            {proof ? (
              <em data-tone="ok">PROOF READY</em>
            ) : (
              <button
                className="tm-proof-button"
                type="button"
                disabled={proofLoading}
                onClick={() => void generateHoldProof()}
              >
                {proofLoading ? "GENERATING…" : "GENERATE HOLD PROOF"}
              </button>
            )}
          </div>

          {!proof && !proofError && (
            <div className="tm-proof-prompt">
              <div>
                <strong>No automatic firewall call</strong>
                <p>
                  Generate a read-only HOLD snapshot only when you need current
                  findings, attestations, integrity state and a canonical proof
                  hash.
                </p>
              </div>
              <span>NO EXECUTION QUOTE · NO SIGNATURE · NO TRANSACTION</span>
            </div>
          )}

          {proofError && (
            <div className="tm-intel-empty">
              <span>PROOF UNAVAILABLE</span>
              <strong>{proofError}</strong>
              <button
                className="tm-proof-retry"
                type="button"
                disabled={proofLoading}
                onClick={() => void generateHoldProof()}
              >
                RETRY
              </button>
            </div>
          )}

          {proof && (
            <>
              <div className="tm-proof-grid">
                <div>
                  <span>Proof ID</span>
                  <strong>{proof.proof.proofId}</strong>
                </div>
                <div>
                  <span>Schema</span>
                  <strong>{proof.proof.schemaVersion}</strong>
                </div>
                <div>
                  <span>Checked</span>
                  <strong>{dateLabel(proof.checkedAt)}</strong>
                </div>
                <div>
                  <span>Intent</span>
                  <strong>{proof.request.intent}</strong>
                </div>
                <div className="tm-proof-hash">
                  <span>Data hash</span>
                  <strong title={proof.proof.dataHash}>
                    {shortHash(proof.proof.dataHash)}
                  </strong>
                </div>
              </div>

              <div className="tm-proof-wrapper-grid">
                {proof.wrappers.map((wrapper) => (
                  <div
                    className="tm-proof-wrapper"
                    key={wrapper.identity.contractAddress}
                  >
                    <div className="tm-proof-wrapper-head">
                      <div>
                        <span>{providerLabel(wrapper.identity.platform)}</span>
                        <strong>{wrapper.identity.symbol}</strong>
                      </div>
                      <em data-tone={tone(wrapper.integrity.status)}>
                        {wrapper.integrity.status}
                      </em>
                    </div>

                    <div className="tm-proof-checks">
                      <div>
                        <span>Daily attestation</span>
                        <strong
                          data-tone={tone(wrapper.passport.attestation.daily)}
                        >
                          {wrapper.passport.attestation.daily}
                        </strong>
                      </div>
                      <div>
                        <span>Monthly attestation</span>
                        <strong
                          data-tone={tone(wrapper.passport.attestation.monthly)}
                        >
                          {wrapper.passport.attestation.monthly}
                        </strong>
                      </div>
                      <div>
                        <span>Token/share ratio</span>
                        <strong>
                          {wrapper.integrity.tokenShareRatioKnown
                            ? "VERIFIED"
                            : "UNKNOWN"}
                        </strong>
                      </div>
                      <div>
                        <span>Reference</span>
                        <strong>
                          {wrapper.integrity.referenceAvailable
                            ? "AVAILABLE"
                            : "UNAVAILABLE"}
                        </strong>
                      </div>
                    </div>

                    <div className="tm-findings">
                      <span>FINDINGS</span>
                      {wrapper.findings.length ? (
                        wrapper.findings.map((finding) => (
                          <div
                            className="tm-finding"
                            key={`${wrapper.identity.contractAddress}-${finding.code}`}
                          >
                            <em data-severity={finding.severity}>
                              {finding.severity.toUpperCase()}
                            </em>
                            <div>
                              <strong>{finding.title}</strong>
                              <small>{finding.message}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p>No findings returned for this HOLD snapshot.</p>
                      )}
                    </div>

                    <div className="tm-evidence-list">
                      <span>EVIDENCE SOURCES</span>
                      {wrapper.sources.map((source, index) => (
                        <div key={`${source.endpoint}-${index}`}>
                          <strong>{source.endpoint}</strong>
                          <small>{source.provider}</small>
                          <em
                            data-tone={tone(
                              source.upstreamCode === undefined ||
                                source.upstreamCode === 0
                                ? "AVAILABLE"
                                : "UNAVAILABLE",
                            )}
                          >
                            {source.upstreamCode === undefined
                              ? "OBSERVED"
                              : `CODE ${source.upstreamCode}`}
                          </em>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="tm-intel-note">
                HOLD proof is generated from the frozen firewall path with no
                amount, so Underly does not request an execution quote. The proof
                hashes the complete evidence snapshot returned by the firewall.
              </p>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
