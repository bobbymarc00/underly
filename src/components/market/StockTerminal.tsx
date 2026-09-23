"use client";

import { useEffect, useMemo, useState } from "react";

import { providerLabel } from "@/lib/ui/format";
import { selectHeadlineReference } from "@/lib/ui/reference-selection";
import type {
  CompanyPayload,
  ResolvedField,
} from "@/lib/ui/market-types";

import { ContinuityPanel } from "./ContinuityPanel";
import { ExecutionReadinessPanel } from "./ExecutionReadinessPanel";
import { PreflightPanel } from "./PreflightPanel";
import { StockIntelligencePanels } from "./StockIntelligencePanels";
import { TerminalHeader } from "./TerminalHeader";

function field(
  source: Record<string, ResolvedField> | undefined,
  name: string,
): ResolvedField | null {
  return source?.[name] ?? null;
}

function fieldValue(
  source: Record<string, ResolvedField> | undefined,
  name: string,
): string | null {
  return field(source, name)?.value ?? null;
}

function numeric(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: string | null): string {
  const parsed = numeric(value);
  if (parsed === null) return "—";
  if (Math.abs(parsed) >= 1_000_000) {
    return `$${new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(parsed)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: parsed < 10 ? 4 : 2,
  }).format(parsed);
}

function plain(value: string | null, suffix = ""): string {
  if (value === null || value === "") return "—";
  return `${value}${suffix}`;
}

function referenceSourceLabel(
  value: "UNDERLYING_MARKET" | "RWA_PRICE" | null | undefined,
): string | null {
  if (value === "UNDERLYING_MARKET") return "Underlying Market";
  if (value === "RWA_PRICE") return "RWA Price";
  return null;
}
function sessionLabel(value: boolean | null): string {
  if (value === true) return "AVAILABLE";
  if (value === false) return "RESTRICTED";
  return "UNKNOWN";
}

function statusTone(status: string): string {
  if (status === "AVAILABLE" || status === "CONSENSUS") return "ok";
  if (status === "PARTIAL" || status === "SINGLE_SOURCE") return "warn";
  if (status === "CONFLICT" || status === "UNAVAILABLE") return "bad";
  return "neutral";
}

function fieldEvidenceNote(
  resolved: ResolvedField | null,
  isMoney: boolean,
): string | null {
  if (!resolved) return null;

  if (resolved.status === "UNKNOWN") {
    return "No usable provider value";
  }

  if (resolved.status !== "CONFLICT") {
    return null;
  }

  if (!resolved.evidence.length) {
    return "Provider values disagree";
  }

  return resolved.evidence
    .slice(0, 3)
    .map((item) => {
      const value = isMoney ? money(item.value) : plain(item.value);
      return `${providerLabel(item.provider)} ${value}`;
    })
    .join(" · ");
}

function fundLikeIndustry(value: string | null): boolean {
  if (!value) return false;
  return /\b(?:ETF|FUND)\b/i.test(value);
}

export function StockTerminal({ ticker }: { ticker: string }) {
  const [company, setCompany] = useState<CompanyPayload | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCompany(null);
    setCompanyError(null);

    fetch(`/api/company?ticker=${encodeURIComponent(ticker)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as CompanyPayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error ?? `HTTP ${response.status}`);
        }
        return body;
      })
      .then(setCompany)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setCompanyError(
          caught instanceof Error ? caught.message : "Company data failed",
        );
      });

    return () => controller.abort();
  }, [ticker]);

  const fundamentals = company?.fundamentals.fields;
  const profile = company?.company.fields;
  const companyName = company?.company.name ?? ticker;
  const industry = fieldValue(profile, "industry");
  const website = fieldValue(profile, "website");
  const description = fieldValue(profile, "description");
  const reference = selectHeadlineReference(company?.wrappers ?? []);
  const isFundLike = fundLikeIndustry(industry);

  const marketState = useMemo(() => {
    if (!company?.wrappers.length) return "UNKNOWN";
    const values = company.wrappers.map(
      (wrapper) => wrapper.marketSession.tradingAvailable,
    );
    if (values.every((value) => value === true)) return "TRADING";
    if (values.every((value) => value === false)) return "RESTRICTED";
    if (values.some((value) => value === true)) return "MIXED";
    return "UNKNOWN";
  }, [company]);

  return (
    <main className="tm-app">
      <TerminalHeader active="markets" ticker={ticker} />

      <section className="tm-shell tm-stock-head">
        <div>
          <div className="tm-stock-symbol-line">
            <strong>{ticker}</strong>
            <span>{companyName}</span>
          </div>
          <div className="tm-stock-reference">
            <strong>{money(reference?.value ?? null)}</strong>
            <span>REFERENCE</span>
            {reference && (
              <em data-tone={statusTone(reference.status)}>
                {reference.status.replaceAll("_", " ")}
              </em>
            )}
          </div>
          <p>
            {industry ?? "Tokenized equity"} · {company?.wrappers.length ?? "—"}{" "}
            wrapper{company?.wrappers.length === 1 ? "" : "s"} on BNB
          </p>
        </div>

        <div className="tm-stock-status">
          <span>MARKET STATE</span>
          <strong data-state={marketState}>{marketState}</strong>
          <small>
            {company?.state
              ? `Evidence ${company.state.toLowerCase()}`
              : "Resolving wrapper evidence…"}
          </small>
        </div>
      </section>

      {companyError && (
        <section className="tm-shell">
          <div className="tm-callout tm-callout-error">
            <span>PARTIAL UI EVIDENCE</span>
            <strong>{companyError}</strong>
            <small>
              Underly keeps unavailable sources explicit instead of inventing
              values.
            </small>
          </div>
        </section>
      )}

      <section className="tm-shell tm-wrapper-strip">
        <div className="tm-section-head tm-section-head-tight">
          <div>
            <span>WRAPPERS</span>
            <h2>Same underlying, separate evidence</h2>
          </div>
        </div>

        <div className="tm-wrapper-rows">
          {!company &&
            !companyError &&
            Array.from({ length: 2 }, (_, index) => (
              <div className="tm-wrapper-row tm-skeleton" key={index} />
            ))}

          {company?.wrappers.map((wrapper) => (
            <div className="tm-wrapper-row" key={wrapper.contractAddress}>
              <div className="tm-wrapper-id">
                <em>{providerLabel(wrapper.provider)}</em>
                <strong>{wrapper.symbol}</strong>
                <small>{wrapper.contractAddress}</small>
              </div>
              <div>
                <span>REFERENCE</span>
                <strong>{money(wrapper.fundamentals.referencePrice)}</strong>
                {referenceSourceLabel(
                  wrapper.fundamentalsSource?.referencePrice,
                ) && (
                  <small>
                    {referenceSourceLabel(
                      wrapper.fundamentalsSource?.referencePrice,
                    )}
                  </small>
                )}
              </div>
              <div>
                <span>TOKEN / SHARE</span>
                <strong>{plain(wrapper.tokenShareRatio)}</strong>
              </div>
              <div>
                <span>P/E TTM</span>
                <strong>{plain(wrapper.fundamentals.peRatioTTM)}</strong>
              </div>
              <div>
                <span>DIVIDEND YIELD · NORMALIZED</span>
                <strong>
                  {plain(
                    wrapper.fundamentals.dividendYieldPercent,
                    "%",
                  )}
                </strong>
                <small>
                  raw {plain(wrapper.fundamentals.dividendYield)}
                </small>
              </div>
              <div>
                <span>TRADING ACCESS</span>
                <strong>
                  {sessionLabel(wrapper.marketSession.tradingAvailable)}
                </strong>
                <small>{wrapper.marketSession.status ?? "No label"}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="tm-shell tm-overview-grid">
        <article className="tm-overview-panel">
          <div className="tm-panel-title">
            <span>UNDERLYING</span>
            <h3>Underlying profile</h3>
          </div>
          {description && (
            <p className="tm-company-description">{description}</p>
          )}

          {isFundLike && (
            <p className="tm-profile-context">
              Fund-like underlying detected. Corporate-officer fields are not
              shown when they are not meaningful for the asset type.
            </p>
          )}

          <div className="tm-company-meta">
            <div>
              <span>{isFundLike ? "Asset type" : "Industry"}</span>
              <strong>{industry ?? "—"}</strong>
            </div>

            {isFundLike ? (
              <div>
                <span>Wrappers</span>
                <strong>{company?.wrappers.length ?? "—"}</strong>
              </div>
            ) : (
              <div>
                <span>CEO</span>
                <strong>{fieldValue(profile, "ceo") ?? "—"}</strong>
              </div>
            )}

            <div>
              <span>Website</span>
              {website ? (
                <a href={website} target="_blank" rel="noreferrer">
                  SOURCE ↗
                </a>
              ) : (
                <strong>—</strong>
              )}
            </div>
          </div>
        </article>

        <article className="tm-overview-panel">
          <div className="tm-panel-title">
            <span>FUNDAMENTALS</span>
            <h3>Resolved evidence</h3>
          </div>
          <div className="tm-fund-grid">
            {[
              ["Market cap", "marketCap", true],
              ["52W high", "high52W", true],
              ["52W low", "low52W", true],
              ["P/E TTM", "peRatioTTM", false],
              ["P/B", "pbRatio", false],
              ["Latest dividend", "latestDividend", false],
            ].map(([label, key, isMoney]) => {
              const resolved = field(
                fundamentals,
                String(key),
              );
              return (
                <div key={String(key)}>
                  <span>{label}</span>
                  <strong>
                    {isMoney
                      ? money(resolved?.value ?? null)
                      : plain(resolved?.value ?? null)}
                  </strong>
                  <small
                    data-tone={statusTone(
                      resolved?.status ?? "UNKNOWN",
                    )}
                  >
                    {resolved?.status ?? "UNKNOWN"}
                  </small>

                  {fieldEvidenceNote(
                    resolved,
                    Boolean(isMoney),
                  ) && (
                    <em className="tm-field-evidence-note">
                      {fieldEvidenceNote(
                        resolved,
                        Boolean(isMoney),
                      )}
                    </em>
                  )}
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <StockIntelligencePanels ticker={ticker} />

      <ContinuityPanel ticker={ticker} />

      <PreflightPanel ticker={ticker} />

      <ExecutionReadinessPanel key={ticker} ticker={ticker} />

      <section className="tm-shell tm-stock-next">
        <div>
          <span>READ ONLY · WRAPPER INTELLIGENCE</span>
          <strong>Evidence-first stock detail</strong>
        </div>
        <p>
          Underlying evidence, standardized liquidity, current and historical
          corporate actions, and on-demand HOLD proof are presented without
          ranking wrappers or creating transaction paths.
        </p>
      </section>
    </main>
  );
}
