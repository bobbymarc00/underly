import Decimal from "decimal.js";
import { THRESHOLDS } from "@/lib/rules/thresholds";
import type { Finding, Intent } from "@/types";
import type { ExecutionResult } from "./execution";

type AttestationState = "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN";
type CorporateActionStatus = "CLEAR" | "ACTIVE" | "UNKNOWN";

export function buildFindings(params: {
  intent: Intent;
  referenceGapPct: string | null;
  referenceUpstreamCode?: number | null;
  tradingAvailable?: boolean | null;
  marketOpen?: boolean | null;
  execution: ExecutionResult;
  tokenShareRatioKnown: boolean;
  attestationDaily: AttestationState;
  passportPartial: boolean;
  passportMissingFields?: string[];
  corporateActionStatus?: CorporateActionStatus;
}): Finding[] {
  const findings: Finding[] = [];
  const tradingAvailable = params.tradingAvailable ?? params.marketOpen ?? null;

  if (params.referenceGapPct !== null) {
    const gap = new Decimal(params.referenceGapPct).abs();
    if (gap.greaterThanOrEqualTo(THRESHOLDS.referenceGap.warningPct)) {
      findings.push({
        code: "REFERENCE_DIVERGENCE",
        severity: "warning",
        title: "Token/reference divergence",
        message: "The token price is materially different from the reported underlying reference price.",
        evidence: { referenceGapPct: params.referenceGapPct },
      });
    }
  } else if (params.referenceUpstreamCode === 42900) {
    findings.push({
      code: "UPSTREAM_RATE_LIMITED",
      severity: "unknown",
      title: "Reference source temporarily rate-limited",
      message: "Binance Web3 API rate-limited the RWA price request after Underly exhausted its bounded retries.",
      evidence: { upstreamCode: 42900 },
    });
  } else {
    findings.push({
      code: "REFERENCE_UNAVAILABLE",
      severity: "unknown",
      title: "Reference price unavailable",
      message: "Underly could not obtain a current reference price for this wrapper.",
    });
  }

  if (tradingAvailable === false) {
    findings.push({
      code: "NON_TRADING_SESSION",
      severity: "warning",
      title: "Token is not currently tradeable",
      message: "The current RWA market status reports that trading is unavailable.",
    });
  }

  if (params.execution.entry.attempted && !params.execution.entry.available) {
    const errorCode = params.execution.entry.errorCode;
    if (errorCode === 40374 || String(errorCode) === "40374") {
      findings.push({
        code: "INSUFFICIENT_LIQUIDITY",
        severity: "warning",
        title: "Insufficient entry liquidity",
        message: "The current entry quote could not be produced because available routing liquidity is insufficient for the requested size.",
        evidence: { errorCode, errorMessage: params.execution.entry.errorMessage },
      });
    } else if (errorCode === 40367 || String(errorCode) === "40367") {
      findings.push({
        code: "NON_TRADING_SESSION",
        severity: "critical",
        title: "Token is not currently tradeable",
        message: "The entry quote was rejected because the token is currently outside its supported trading session.",
        evidence: { errorCode, errorMessage: params.execution.entry.errorMessage },
      });
    } else {
      findings.push({
        code: "NO_ENTRY_ROUTE",
        severity: "warning",
        title: "No executable entry route",
        message: "Underly could not obtain a current executable entry quote for the requested size.",
        evidence: { errorCode, errorMessage: params.execution.entry.errorMessage },
      });
    }
  }

  if (params.execution.exit.attempted && !params.execution.exit.available) {
    const errorCode = params.execution.exit.errorCode;
    if (errorCode === 40374 || String(errorCode) === "40374") {
      findings.push({
        code: "INSUFFICIENT_LIQUIDITY",
        severity: "warning",
        title: "Insufficient exit liquidity",
        message: "The current exit quote could not be produced because available routing liquidity is insufficient for the requested size.",
        evidence: { errorCode, errorMessage: params.execution.exit.errorMessage },
      });
    } else if (errorCode === 40367 || String(errorCode) === "40367") {
      findings.push({
        code: "NON_TRADING_SESSION",
        severity: "critical",
        title: "Token is not currently tradeable",
        message: "The exit quote was rejected because the token is currently outside its supported trading session.",
        evidence: { errorCode, errorMessage: params.execution.exit.errorMessage },
      });
    } else {
      findings.push({
        code: "NO_EXIT_ROUTE",
        severity: "warning",
        title: "No executable exit route",
        message: "Underly could not obtain a current executable exit quote for the requested position.",
        evidence: { errorCode, errorMessage: params.execution.exit.errorMessage },
      });
    }
  }

  if (
    (params.intent === "SELL" || params.intent === "COLLATERAL") &&
    !params.execution.exit.attempted &&
    params.execution.exit.errorMessage
  ) {
    findings.push({
      code: "EXECUTION_DATA_UNAVAILABLE",
      severity: "unknown",
      title: params.intent === "SELL" ? "Direct exit quote unavailable" : "Liquidation value unavailable",
      message: params.execution.exit.errorMessage,
    });
  }

  if (params.execution.currentHaircutPct !== null && params.intent !== "HOLD") {
    const friction = new Decimal(params.execution.currentHaircutPct);
    if (friction.greaterThanOrEqualTo(THRESHOLDS.executionHaircut.warningPct)) {
      findings.push({
        code: "HIGH_EXECUTION_FRICTION",
        severity: friction.greaterThanOrEqualTo(THRESHOLDS.executionHaircut.severePct)
          ? "critical"
          : "warning",
        title: "Elevated current execution friction",
        message:
          params.intent === "BUY"
            ? "Current entry-to-full-exit liquidity probing shows elevated execution friction."
            : params.intent === "SELL"
              ? "Current direct exit proceeds are below the current position mark."
              : "Current liquidation value is below the current collateral position mark.",
        evidence: {
          benchmarkNotionalUsd: params.execution.benchmarkNotionalUsd,
          executableValueUsd: params.execution.executableValueUsd,
          haircutPct: params.execution.currentHaircutPct,
          entryFrictionPct: params.execution.breakdown.entry?.frictionPct ?? null,
          exitFrictionPct: params.execution.breakdown.exit?.frictionPct ?? null,
          roundTripFrictionPct: params.execution.breakdown.roundTrip?.frictionPct ?? null,
        },
      });
    }
  }

  if (!params.tokenShareRatioKnown) {
    findings.push({
      code: "TOKEN_SHARE_RATIO_UNKNOWN",
      severity: "unknown",
      title: "Token/share ratio unavailable",
      message: "Underly could not verify the current token-to-underlying-share relationship.",
    });
  }

  if (params.attestationDaily === "UNAVAILABLE") {
    findings.push({
      code: "ATTESTATION_UNAVAILABLE",
      severity: "unknown",
      title: "Attestation unavailable",
      message: "A current daily attestation could not be verified for this wrapper.",
    });
  }

  if (params.passportPartial) {
    const missingFields = params.passportMissingFields ?? [];
    const attestationOnly =
      missingFields.length > 0 &&
      missingFields.every(
        (field) =>
          field === "dailyAttestation" ||
          field === "monthlyAttestation",
      );
    const labels = missingFields.map((field) => {
      if (field === "dailyAttestation") return "daily attestation";
      if (field === "monthlyAttestation") return "monthly attestation";
      if (field === "tokenShareRatio") return "token/share ratio";
      return field;
    });

    findings.push({
      code: "WRAPPER_DATA_INCOMPLETE",
      severity: "unknown",
      title: attestationOnly
        ? "Attestation metadata is incomplete"
        : "Wrapper metadata is incomplete",
      message: labels.length
        ? `Missing: ${labels.join(", ")}. Underly will not treat missing data as a pass.`
        : "Some wrapper integrity fields are unavailable; Underly will not treat missing data as a pass.",
      evidence: missingFields.length
        ? { missingFields: missingFields.join(", ") }
        : undefined,
    });
  }

  if (params.corporateActionStatus === "ACTIVE") {
    findings.push({
      code: "CORPORATE_ACTION_ACTIVE",
      severity: "warning",
      title: "Corporate-action restriction detected",
      message: "The token currently reports a trading restriction associated with a corporate-action signal.",
    });
  }

  function severityRank(severity: Finding["severity"]): number {
    switch (severity) {
      case "critical":
        return 3;
      case "warning":
        return 2;
      case "info":
        return 1;
      case "unknown":
      default:
        return 0;
    }
  }

  const deduped = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = deduped.get(finding.code);
    if (!existing || severityRank(finding.severity) > severityRank(existing.severity)) {
      deduped.set(finding.code, finding);
    }
  }

  return Array.from(deduped.values());
}

