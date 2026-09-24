"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  formatNumber,
  formatPct,
  formatUsd,
  providerLabel,
} from "@/lib/ui/format";

type Deployment = {
  provider: string;
  symbol: string;
  contractAddress: string;
  tokenShareRatio: string | null;
};

export interface ContinuityContext {
  sourceContractAddress: string;
  sourceTokenAmount: string;
}

type ContinuityResponse = {
  version: string;
  generatedAt: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  ticker: string;
  request: {
    sourceContractAddress: string;
    sourceTokenAmount: string;
    walletAddress: string | null;
  };
  source: {
    provider: string;
    symbol: string;
    contractAddress: string;
    tokenShareRatio: string | null;
    ratioSource: string;
    tokenAmount: string;
    underlyingShares: string | null;
    exit: {
      state: "AVAILABLE" | "UNAVAILABLE";
      recoveredUsdt: string | null;
      vendor: string | null;
      executionMode: string | null;
      priceImpactPercent: string | null;
      tradeFee: string | null;
      estimateGasFee: string | null;
    };
  };
  summary: {
    targetCount: number;
    available: number;
    unavailable: number;
  };
  targets: Array<{
    provider: string;
    symbol: string;
    contractAddress: string;
    tokenShareRatio: string | null;
    ratioSource: string;
    quote: {
      state: "AVAILABLE" | "UNAVAILABLE";
      vendor: string | null;
      executionMode: string | null;
      priceImpactPercent: string | null;
      tradeFee: string | null;
      estimateGasFee: string | null;
      quotedTokenAmount: string | null;
      upstreamCode: number | null;
      upstreamMessage: string | null;
    };
    continuity: {
      status: "AVAILABLE" | "UNAVAILABLE";
      sourceTokenAmount: string | null;
      sourceUnderlyingShares: string | null;
      targetTokenAmount: string | null;
      targetUnderlyingShares: string | null;
      parityTargetTokenAmount: string | null;
      underlyingRetentionPct: string | null;
      underlyingDeltaPct: string | null;
    };
  }>;
  readOnly: {
    privateKeyRequired: false;
    signatureRequested: false;
    approvalRequested: false;
    transactionBuilt: false;
    transactionBroadcast: false;
  };
  error?: string;
};

function signedPct(value: string | null): string {
  if (value === null) return "Unknown";

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return formatPct(value);

  return `${parsed > 0 ? "+" : ""}${formatPct(parsed)}`;
}

function continuityTone(
  value: string | null,
): "positive" | "negative" | "neutral" {
  if (value === null) return "neutral";

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return "neutral";
  return parsed > 0 ? "positive" : "negative";
}

export function ContinuityPanel({
  ticker,
  initialContext,
  discovery,
}: {
  ticker: string;
  initialContext?: ContinuityContext | null;
  discovery: {
    deployments: Deployment[];
    error: string | null;
    loading: boolean;
  };
}) {
  const [sourceContract, setSourceContract] = useState("");
  const [sourceAmount, setSourceAmount] = useState("1");
  const [result, setResult] = useState<ContinuityResponse | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);

  function invalidateRequest() {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
    setResult(null);
    setRequestError(null);
  }

  useEffect(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale ticker/context state before async discovery
    setSourceContract("");
    setSourceAmount("1");
    setResult(null);
    setRequestError(null);
    setLoading(false);

    if (discovery.deployments.length) {
      const requestedSource = initialContext
        ? discovery.deployments.find(
            (deployment) =>
              deployment.contractAddress.toLowerCase() ===
              initialContext.sourceContractAddress.toLowerCase(),
          )
        : null;
      if (requestedSource && initialContext) {
        setSourceContract(requestedSource.contractAddress);
        setSourceAmount(initialContext.sourceTokenAmount);
      } else {
        setSourceContract(discovery.deployments[0].contractAddress);
      }
    }

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [discovery.deployments, initialContext, ticker]);

  const deployments = discovery.deployments;
  const discoveryError = discovery.error;
  const discovering = discovery.loading;

  const selectedSource = useMemo(
    () =>
      deployments.find(
        (item) =>
          item.contractAddress.toLowerCase() ===
          sourceContract.toLowerCase(),
      ) ?? null,
    [deployments, sourceContract],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!sourceContract) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const requestedTicker = ticker;
    const requestedContract = sourceContract;
    const requestedAmount = sourceAmount;

    setLoading(true);
    setRequestError(null);
    setResult(null);

    try {
      const response = await fetch("/api/continuity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceContractAddress: requestedContract,
          sourceTokenAmount: requestedAmount,
        }),
        signal: controller.signal,
      });

      const body = (await response.json()) as ContinuityResponse;

      if (!response.ok) {
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }

      if (
        controller.signal.aborted ||
        requestSequenceRef.current !== requestSequence
      ) {
        return;
      }

      if (
        body.ticker.toUpperCase() !== requestedTicker.toUpperCase() ||
        body.request.sourceContractAddress.toLowerCase() !==
          requestedContract.toLowerCase()
      ) {
        throw new Error("Continuity response context mismatch");
      }

      setResult(body);
    } catch (caught) {
      if (
        controller.signal.aborted ||
        requestSequenceRef.current !== requestSequence
      ) {
        return;
      }

      setRequestError(
        caught instanceof Error
          ? caught.message
          : "Continuity analysis failed",
      );
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section id="continuity" className="tm-shell tm-continuity">
      <div className="tm-continuity-head">
        <div>
          <span className="tm-eyebrow">
            UNDERLY CONTINUITY ROUTER · BSC
          </span>
          <h2>Measure wrapper-to-wrapper exposure continuity.</h2>
          <p>
            Observe how much current underlying-equivalent equity exposure
            survives a live source-wrapper to USDT to alternative-wrapper
            quote path.
          </p>
        </div>

        <form className="tm-continuity-form" onSubmit={submit}>
          <label>
            <span>SOURCE REPRESENTATION</span>
            <select
              value={sourceContract}
              onChange={(event) => {
                setSourceContract(event.target.value);
                invalidateRequest();
              }}
              disabled={discovering || deployments.length === 0}
              aria-label="Continuity source representation"
            >
              {deployments.length === 0 && (
                <option value="">
                  {discovering ? "DISCOVERING..." : "NO WRAPPERS"}
                </option>
              )}

              {deployments.map((deployment) => (
                <option
                  value={deployment.contractAddress}
                  key={deployment.contractAddress}
                >
                  {providerLabel(deployment.provider)} · {deployment.symbol}
                  {" · "}
                  {deployment.contractAddress}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>SOURCE TOKEN AMOUNT</span>
            <input
              inputMode="decimal"
              value={sourceAmount}
              onChange={(event) => {
                setSourceAmount(event.target.value);
                invalidateRequest();
              }}
              aria-label="Continuity source token amount"
            />
          </label>

          <button
            type="submit"
            disabled={
              loading ||
              discovering ||
              deployments.length < 2 ||
              !sourceContract
            }
          >
            {loading ? "ROUTING..." : "MEASURE CONTINUITY"}
          </button>
        </form>
      </div>

      <p className="tm-continuity-boundary">
        QUOTE ONLY · CURRENT SNAPSHOT · NO AUTOMATIC TARGET SELECTION · NO
        SIGNATURE · NO APPROVAL · NO BROADCAST
      </p>

      {initialContext &&
        selectedSource?.contractAddress.toLowerCase() ===
          initialContext.sourceContractAddress.toLowerCase() && (
          <p className="tm-continuity-context">
            PORTFOLIO CONTEXT · SOURCE {selectedSource.symbol} · AMOUNT{" "}
            {sourceAmount} · REVIEW BEFORE MEASURING
          </p>
        )}

      {discoveryError && (
        <div className="tm-callout tm-callout-error">
          <span>WRAPPER DISCOVERY UNAVAILABLE</span>
          <strong>{discoveryError}</strong>
          <small>No continuity state was fabricated.</small>
        </div>
      )}

      {!discovering && !discoveryError && deployments.length < 2 && (
        <div className="tm-continuity-empty">
          <span>NO ALTERNATIVE REPRESENTATION</span>
          <strong>
            Continuity requires at least two discovered BSC representations
            of the same underlying.
          </strong>
        </div>
      )}

      {requestError && (
        <div className="tm-callout tm-callout-error">
          <span>CONTINUITY UNAVAILABLE</span>
          <strong>{requestError}</strong>
          <small>No route or retention value was invented.</small>
        </div>
      )}

      {selectedSource && !result && deployments.length >= 2 && (
        <div className="tm-continuity-source-preview">
          <span>SOURCE</span>
          <strong>
            {providerLabel(selectedSource.provider)} · {selectedSource.symbol}
          </strong>
          <small>
            Current token/share ratio{" "}
            {selectedSource.tokenShareRatio ?? "unknown"}
          </small>
        </div>
      )}

      {result && (
        <>
          <div className="tm-continuity-summary">
            <span data-state={result.status}>{result.status}</span>
            <span>{result.summary.targetCount} ALTERNATIVE ROUTES</span>
            <span>{result.summary.available} AVAILABLE</span>
            <span>{result.summary.unavailable} UNAVAILABLE</span>
          </div>

          <div className="tm-continuity-source">
            <div className="tm-continuity-source-id">
              <span>SOURCE EXPOSURE</span>
              <strong>
                {providerLabel(result.source.provider)} ·{" "}
                {result.source.symbol}
              </strong>
              <small>{result.source.contractAddress}</small>
            </div>

            <div>
              <span>TOKEN AMOUNT</span>
              <strong>{formatNumber(result.source.tokenAmount)}</strong>
            </div>

            <div>
              <span>UNDERLYING-EQUIV</span>
              <strong>
                {formatNumber(result.source.underlyingShares)}
              </strong>
            </div>

            <div>
              <span>EXIT RECOVERY</span>
              <strong>
                {result.source.exit.recoveredUsdt
                  ? formatUsd(result.source.exit.recoveredUsdt)
                  : "Unavailable"}
              </strong>
              <small>{result.source.exit.vendor ?? "No route"}</small>
            </div>
          </div>

          <div className="tm-continuity-grid">
            {result.targets.map((target) => (
              <article
                className="tm-continuity-card"
                key={target.contractAddress}
              >
                <div className="tm-continuity-card-head">
                  <div>
                    <span>{providerLabel(target.provider)}</span>
                    <strong>{target.symbol}</strong>
                    <small>{target.contractAddress}</small>
                  </div>

                  <em data-state={target.continuity.status}>
                    {target.continuity.status}
                  </em>
                </div>

                <div className="tm-continuity-metrics">
                  <div>
                    <span>TARGET TOKENS</span>
                    <strong>
                      {formatNumber(target.continuity.targetTokenAmount)}
                    </strong>
                  </div>

                  <div>
                    <span>TARGET UNDERLYING-EQUIV</span>
                    <strong>
                      {formatNumber(
                        target.continuity.targetUnderlyingShares,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>PARITY TARGET</span>
                    <strong>
                      {formatNumber(
                        target.continuity.parityTargetTokenAmount,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>EXPOSURE RETENTION</span>
                    <strong>
                      {target.continuity.underlyingRetentionPct
                        ? formatPct(
                            target.continuity.underlyingRetentionPct,
                          )
                        : "Unknown"}
                    </strong>
                  </div>

                  <div>
                    <span>EXPOSURE DELTA</span>
                    <strong
                      data-tone={continuityTone(
                        target.continuity.underlyingDeltaPct,
                      )}
                    >
                      {signedPct(
                        target.continuity.underlyingDeltaPct,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>LIVE ROUTE</span>
                    <strong>
                      {target.quote.state === "AVAILABLE"
                        ? target.quote.vendor ?? "AVAILABLE"
                        : "UNAVAILABLE"}
                    </strong>
                  </div>
                </div>

                <p className="tm-continuity-note">
                  Current ratio evidence: {target.ratioSource.replaceAll("_", " ")}.
                  This route is an observation, not a destination recommendation.
                </p>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
