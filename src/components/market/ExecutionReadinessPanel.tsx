"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  buildExecutionReadinessRequest,
  describeBuildBinding,
  deriveExecutionReadinessPresentation,
  executionReadinessUiReducer,
  initialExecutionReadinessUiState,
  parseExecutionReadinessResponse,
  resultMatchesTicker,
  type ExecutionReadinessForm,
  type ReadinessUiError,
} from "@/lib/ui/execution-readiness";
import {
  formatNumber,
  formatTimestamp,
  formatUsd,
  providerLabel,
} from "@/lib/ui/format";

type Deployment = {
  provider: string;
  symbol: string;
  contractAddress: string;
  chainId: string;
};

type AssetGraphResponse = {
  underlyings?: Array<{
    ticker: string;
    deployments: Deployment[];
  }>;
  error?: string;
};

type ErrorResponse = {
  error?: string;
  code?: string;
  issues?: Array<{ path: string; message: string }>;
};

class ReadinessRequestError extends Error {
  constructor(
    readonly kind: ReadinessUiError["kind"],
    message: string,
  ) {
    super(message);
  }
}

function apiErrorMessage(body: ErrorResponse, status: number): string {
  const issueText = body.issues
    ?.map((issue) => `${issue.path || "request"}: ${issue.message}`)
    .join(" · ");
  return issueText || body.error || body.code || `HTTP ${status}`;
}

function evidenceValue(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "UNKNOWN";
}

export function ExecutionReadinessPanel({ ticker }: { ticker: string }) {
  const [state, dispatch] = useReducer(
    executionReadinessUiReducer,
    undefined,
    initialExecutionReadinessUiState,
  );
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current?.abort();
    requestSequence.current += 1;
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      dispatch({ type: "tickerChanged" });
      setDeployments([]);
      setDiscoveryError(null);
      setDiscovering(true);
    });

    fetch(`/api/asset-graph?ticker=${encodeURIComponent(ticker)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as AssetGraphResponse;
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        setDeployments(body.underlyings?.[0]?.deployments ?? []);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setDiscoveryError(
          caught instanceof Error
            ? caught.message
            : "Wrapper discovery failed",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiscovering(false);
      });

    return () => controller.abort();
  }, [ticker]);

  useEffect(() => {
    if (!resultMatchesTicker(state.result, ticker)) return;
    const expiresMs = Date.parse(state.result!.expiresAt);
    if (!Number.isFinite(expiresMs)) return;

    const delay = Math.max(0, expiresMs - Date.now() + 25);
    const timeout = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.min(delay, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [state.result, ticker]);

  const selectedDeployment = useMemo(
    () =>
      deployments.find(
        (deployment) =>
          deployment.contractAddress.toLowerCase() ===
          state.form.wrapperContractAddress.toLowerCase(),
      ) ?? null,
    [deployments, state.form.wrapperContractAddress],
  );

  const displayedResult = resultMatchesTicker(state.result, ticker)
    ? state.result
    : null;
  const presentation = displayedResult
    ? deriveExecutionReadinessPresentation(displayedResult, nowMs)
    : null;
  const buildBinding = displayedResult
    ? describeBuildBinding(displayedResult.build)
    : null;

  function changeInput(
    field: keyof ExecutionReadinessForm,
    value: string,
  ) {
    requestController.current?.abort();
    requestController.current = null;
    requestSequence.current += 1;
    dispatch({ type: "inputChanged", field, value });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestController.current?.abort();

    let payload;
    try {
      payload = buildExecutionReadinessRequest(ticker, state.form);
    } catch (caught) {
      requestSequence.current += 1;
      dispatch({
        type: "validationFailed",
        error: {
          kind: "INVALID REQUEST",
          message:
            caught instanceof Error ? caught.message : "Check the request inputs.",
        },
      });
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequence.current;
    requestController.current = controller;
    dispatch({ type: "requestStarted", requestId });

    try {
      const response = await fetch("/api/execution-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as unknown;

      if (!response.ok) {
        const kind = response.status === 400
          ? "INVALID REQUEST"
          : "UPSTREAM FAILURE";
        throw new ReadinessRequestError(
          kind,
          apiErrorMessage(body as ErrorResponse, response.status),
        );
      }
      const parsedBody = parseExecutionReadinessResponse(body);
      if (!parsedBody) {
        throw new ReadinessRequestError(
          "UPSTREAM FAILURE",
          "The readiness service returned an invalid response envelope.",
        );
      }
      if (requestId !== requestSequence.current || controller.signal.aborted) {
        return;
      }

      setNowMs(Date.now());
      dispatch({ type: "requestSucceeded", requestId, result: parsedBody });
    } catch (caught) {
      if (controller.signal.aborted || requestId !== requestSequence.current) {
        return;
      }
      dispatch({
        type: "requestFailed",
        requestId,
        error:
          caught instanceof ReadinessRequestError
            ? { kind: caught.kind, message: caught.message }
            : {
                kind: "NETWORK FAILURE",
                message:
                  caught instanceof Error
                    ? caught.message
                    : "The readiness request could not be completed.",
              },
      });
    } finally {
      if (requestController.current === controller) {
        requestController.current = null;
      }
    }
  }

  return (
    <section className="tm-shell tm-readiness">
      <div className="tm-readiness-head">
        <div>
          <span className="tm-eyebrow">EXECUTION READINESS · BSC</span>
          <h2>Assess one exact wrapper without requesting approval.</h2>
          <p>
            Check current economic, integrity, liquidity, unsigned-build, and
            simulation evidence for one explicitly selected representation.
            A successful simulation is predicted evidence, not proof that a
            transaction is safe to execute. The server&apos;s selected-wrapper
            decision is authoritative.
          </p>
        </div>

        <form className="tm-readiness-form" onSubmit={submit}>
          <label className="tm-readiness-wrapper-field">
            <span>EXACT BSC WRAPPER · REQUIRED</span>
            <select
              value={state.form.wrapperContractAddress}
              onChange={(event) =>
                changeInput("wrapperContractAddress", event.target.value)
              }
              disabled={discovering || deployments.length === 0}
              aria-label="Exact BSC wrapper"
            >
              <option value="">
                {discovering
                  ? "DISCOVERING WRAPPERS…"
                  : deployments.length
                    ? "SELECT EXACT WRAPPER"
                    : "NO BSC WRAPPERS"}
              </option>
              {deployments.map((deployment) => (
                <option
                  value={deployment.contractAddress}
                  key={deployment.contractAddress}
                >
                  {providerLabel(deployment.provider)} · {deployment.symbol} ·{" "}
                  {deployment.contractAddress}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>PUBLIC WALLET ADDRESS · REQUIRED</span>
            <input
              value={state.form.walletAddress}
              onChange={(event) =>
                changeInput("walletAddress", event.target.value)
              }
              placeholder="0x… public address only"
              aria-label="Readiness public wallet address"
              autoComplete="off"
            />
          </label>

          <label>
            <span>USDT AMOUNT</span>
            <input
              inputMode="decimal"
              value={state.form.amountUsdt}
              onChange={(event) => changeInput("amountUsdt", event.target.value)}
              aria-label="Readiness USDT amount"
            />
          </label>

          <label>
            <span>SLIPPAGE TOLERANCE %</span>
            <input
              inputMode="decimal"
              value={state.form.slippagePercent}
              onChange={(event) =>
                changeInput("slippagePercent", event.target.value)
              }
              aria-label="Readiness slippage tolerance"
            />
          </label>

          <label>
            <span>MAX REFERENCE GAP % · OPTIONAL</span>
            <input
              inputMode="decimal"
              value={state.form.maxReferenceGapPct}
              onChange={(event) =>
                changeInput("maxReferenceGapPct", event.target.value)
              }
              placeholder="No local guard"
              aria-label="Readiness maximum reference gap"
            />
          </label>

          <button
            type="submit"
            disabled={
              state.loading ||
              discovering ||
              !state.form.wrapperContractAddress
            }
          >
            {state.loading ? "CHECKING READINESS…" : "RUN NEW READINESS CHECK"}
          </button>
        </form>
      </div>

      <div className="tm-readiness-boundary">
        <strong>SIMULATION SUCCESS ≠ EXECUTION SAFETY</strong>
        <strong>EXECUTION_READY ≠ HUMAN APPROVAL</strong>
        <strong>HUMAN APPROVAL ≠ TRANSACTION BROADCAST</strong>
        <span>
          INSPECTION ONLY · PUBLIC ADDRESS · NO PRIVATE KEY OR SEED PHRASE · NO
          SIGNATURE · NO AUTHORIZATION · NO TRANSACTION BROADCAST
        </span>
      </div>

      {discoveryError && (
        <div className="tm-callout tm-callout-error">
          <span>WRAPPER DISCOVERY FAILURE</span>
          <strong>{discoveryError}</strong>
          <small>No destination was selected automatically.</small>
        </div>
      )}

      {!displayedResult && !state.error && !discoveryError && (
        <div className="tm-readiness-empty">
          <span>
            {selectedDeployment ? "WRAPPER SELECTED" : "EXPLICIT SELECTION REQUIRED"}
          </span>
          <strong>
            {selectedDeployment
              ? `${providerLabel(selectedDeployment.provider)} · ${selectedDeployment.symbol}`
              : "Choose one BSC representation to inspect."}
          </strong>
          <small>
            {selectedDeployment
              ? selectedDeployment.contractAddress
              : "Underly does not rank wrappers or assume identical legal rights."}
          </small>
        </div>
      )}

      {state.loading && (
        <div className="tm-readiness-empty" aria-live="polite">
          <span>READINESS CHECK IN PROGRESS</span>
          <strong>Collecting current server-side evidence…</strong>
          <small>The previous snapshot is no longer current.</small>
        </div>
      )}

      {state.error && (
        <div className="tm-callout tm-callout-error" role="alert">
          <span>{state.error.kind}</span>
          <strong>{state.error.message}</strong>
          <small>No readiness state or approval digest is being displayed.</small>
        </div>
      )}

      {displayedResult && presentation && (
        <div className="tm-readiness-result">
          <div className="tm-readiness-summary">
            <div>
              <span>CURRENT DISPLAY STATE</span>
              <strong data-state={presentation.status}>
                {presentation.status}
              </strong>
            </div>
            <div>
              <span>SNAPSHOT CREATED</span>
              <strong>{formatTimestamp(displayedResult.snapshotTimestamp)}</strong>
            </div>
            <div>
              <span>LOCAL EXPIRATION</span>
              <strong>{formatTimestamp(displayedResult.expiresAt)}</strong>
            </div>
          </div>

          <div className="tm-readiness-evidence" aria-label="Assessment stages">
            <div>
              <span>QUOTE AVAILABLE</span>
              <strong>{presentation.assessment.quoteAvailable ? "YES" : "NO"}</strong>
            </div>
            <div>
              <span>UNSIGNED BUILD AVAILABLE</span>
              <strong>
                {presentation.assessment.unsignedBuildAvailable ? "YES" : "NO"}
              </strong>
            </div>
            <div>
              <span>SIMULATION SUCCESSFUL</span>
              <strong>
                {presentation.assessment.simulationSuccessful ? "YES" : "NO"}
              </strong>
              <small>Prediction only; not execution authorization.</small>
            </div>
            <div>
              <span>EXECUTION READINESS</span>
              <strong>{presentation.status}</strong>
            </div>
            <div>
              <span>HUMAN APPROVAL REQUESTED</span>
              <strong>NO</strong>
            </div>
          </div>

          {!presentation.locallyFresh && (
            <div className="tm-readiness-stale" role="status">
              <strong>STALE / RECHECK REQUIRED</strong>
              <span>
                This snapshot has passed Underly&apos;s local freshness limit. It
                is not displayed as current execution readiness.
              </span>
            </div>
          )}

          <div className="tm-readiness-identity">
            <div>
              <span>PROVIDER</span>
              <strong>{providerLabel(displayedResult.selectedWrapper.provider)}</strong>
            </div>
            <div>
              <span>TOKEN SYMBOL</span>
              <strong>{displayedResult.selectedWrapper.symbol}</strong>
            </div>
            <div>
              <span>CHAIN ID</span>
              <strong>{displayedResult.selectedWrapper.chainId}</strong>
            </div>
            <div className="tm-readiness-address">
              <span>CONTRACT ADDRESS</span>
              <strong>{displayedResult.selectedWrapper.contractAddress}</strong>
            </div>
          </div>

          <div className="tm-readiness-evidence">
            <div>
              <span>QUOTED INPUT</span>
              <strong>{formatNumber(displayedResult.request.amountUsdt)} USDT</strong>
              <small>{displayedResult.request.amountRaw} raw units</small>
            </div>
            <div>
              <span>QUOTED OUTPUT</span>
              <strong>
                {displayedResult.economicExposure.quotedTokenAmount
                  ? `${formatNumber(displayedResult.economicExposure.quotedTokenAmount)} ${displayedResult.selectedWrapper.symbol}`
                  : displayedResult.quote.outputAmountRaw
                    ? `${displayedResult.quote.outputAmountRaw} raw units`
                    : "UNAVAILABLE"}
              </strong>
              <small>{displayedResult.quote.vendor ?? "No quote vendor"}</small>
            </div>
            <div>
              <span>UNDERLYING-EQUIVALENT EXPOSURE</span>
              <strong>
                {formatNumber(displayedResult.economicExposure.quotedUnderlyingShares)} shares
              </strong>
              <small>
                  {formatUsd(displayedResult.economicExposure.quotedReferenceValueUsd)} reference value
              </small>
            </div>
            <div>
              <span>ACTIONGUARD STATUS</span>
              <strong>{displayedResult.corporateActions.status}</strong>
            </div>
            <div>
              <span>INTEGRITY STATUS</span>
              <strong>{displayedResult.integrity.status}</strong>
              <small>{displayedResult.integrity.dataCompleteness}</small>
            </div>
            <div>
              <span>REVERSE LIQUIDITY</span>
              <strong>
                {displayedResult.quote.reverse.available ? "AVAILABLE" : "UNAVAILABLE"}
              </strong>
              <small>
                {displayedResult.quote.reverse.recoveredUsdt
                  ? `${formatNumber(displayedResult.quote.reverse.recoveredUsdt)} USDT recovered`
                  : displayedResult.quote.reverse.upstreamMessage ?? "No reverse route"}
              </small>
            </div>
            <div>
              <span>QUOTE/BUILD IDENTITY BINDING</span>
              <strong>{buildBinding?.label ?? "UNAVAILABLE"}</strong>
              <small>{buildBinding?.detail}</small>
            </div>
            <div>
              <span>TRANSACTION SIMULATION</span>
              <strong>{evidenceValue(displayedResult.simulation.state)}</strong>
              <small>{displayedResult.simulation.failReason ?? "No failure reported"}</small>
            </div>
            <div>
              <span>PREDICTED BALANCE DIRECTION</span>
              <strong>{evidenceValue(displayedResult.simulation.direction)}</strong>
            </div>
          </div>

          <div className="tm-readiness-reasons">
            <span>READINESS REASONS</span>
            {displayedResult.readiness.reasons.map((reason) => (
              <div data-severity={reason.severity} key={reason.code}>
                <strong>{reason.code.replaceAll("_", " ")}</strong>
                <p>{reason.message}</p>
              </div>
            ))}
          </div>

          {presentation.approvalDigest && (
            <div className="tm-readiness-digest">
              <span>EVM CALL INTENT DIGEST · IDENTIFIER ONLY</span>
              <strong>{presentation.approvalDigest}</strong>
              <small>
                This binds only the inspected EVM call intent; it is not approval
                of a full unsigned transaction. A final transaction with nonce,
                gas, and fees requires those fields to be checked and newly
                approved.
              </small>
            </div>
          )}

          <p className="tm-readiness-freshness-note">
            {displayedResult.methodology.simulationLimit}{" "}
            {displayedResult.methodology.approvalBinding}{" "}
            {displayedResult.methodology.expiration} The local freshness timer is
            not a guarantee of upstream quote validity.
          </p>
        </div>
      )}
    </section>
  );
}
