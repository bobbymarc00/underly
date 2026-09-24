# Underly v1.0-C — Deployment Readiness Verification

Status: checkpoint preparation only. This document does not authorize a commit,
push, release, production deployment, or rollback.

## Source-verified configuration

| Item | State | Evidence |
| --- | --- | --- |
| Framework | VERIFIED FROM SOURCE | Next.js 16 application with `next build` / `next start` scripts |
| Production build command | VERIFIED FROM SOURCE | `npm run build` |
| Portfolio route duration | VERIFIED FROM SOURCE | `export const maxDuration = 60` |
| Portfolio internal deadline | VERIFIED FROM SOURCE | 50,000 ms |
| Per-upstream timeout | VERIFIED FROM SOURCE | 10,000 ms for portfolio RPC/provider work |
| Portfolio RPC semantics | VERIFIED FROM SOURCE | one explicit BSC block tag and verified Multicall3 |
| Region | REQUIRES DASHBOARD CONFIRMATION | no `vercel.json` or source region override |
| Plan / Fluid Compute | REQUIRES DASHBOARD CONFIRMATION | not represented in the repository |
| Effective deployed duration | REQUIRES DASHBOARD CONFIRMATION | source intent alone does not prove platform acceptance |
| Production Branch / project binding | REQUIRES DASHBOARD CONFIRMATION | local branch is not Vercel project evidence |

## Vercel dashboard checklist

Record evidence without copying secret values into tickets, logs, screenshots, or
the repository.

1. Confirm the intended Vercel team/project, linked Git repository, and production
   domain. Confirm that the Production Branch is the approved checkpoint branch.
2. Confirm Framework Preset is Next.js, Root Directory is the repository root,
   Install Command uses the lockfile, and Build Command is `npm run build`.
3. Record the plan and whether Fluid Compute is enabled for Preview and Production.
4. Inspect the built `/api/portfolio` Function and confirm its effective maximum
   duration is at least 60 seconds. A lower observed duration is a blocker.
5. Confirm the Function region and measure its latency to both the configured BSC
   RPC and Binance provider. Do not assume the platform default is optimal.
6. Confirm these names for the full product surface, without displaying values:
   `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_SECRET`, `UNDERLY_QUOTE_WALLET`,
   `UNDERLY_CHAIN_ID`, and `UNDERLY_RPC_URL`.
7. Confirm each required name is scoped deliberately to both Production and
   Preview. Preview should use separately revocable credentials where supported.
8. Validate Binance credentials with read-only endpoints and validate the RPC with
   `eth_chainId`, `eth_blockNumber`, `eth_getCode`, and `eth_call`. The configured
   chain must be BSC chain ID 56.
9. Confirm provider quota/rate-limit expectations and stop rather than repeatedly
   retrying a provider that is already returning sustained 429 responses.
10. Open Runtime Logs and Observability for `/api/portfolio`; verify HTTP status,
    duration, timeout/abort errors, 429 frequency, stage timing, `PARTIAL` rate, and
    failed balance-read count can be monitored without logging credentials or RPC
    URLs.

Optional product enrichment names are `UNDERLY_NEWS_PROVIDER`,
`ALPHAVANTAGE_API_KEY`, `UNDERLY_CORPORATE_ACTIONS_CACHE_TTL_SECONDS`,
`UNDERLY_NEWS_CACHE_TTL_SECONDS`, and `UNDERLY_NEWS_STALE_MAX_SECONDS`. Missing
optional enrichment must remain explicit and must not corrupt portfolio evidence.

## Deployment blockers

- Wrong Vercel project, repository, or Production Branch.
- Build does not reproduce from the approved checkpoint.
- Effective `/api/portfolio` duration is below 60 seconds.
- Missing or invalid Binance credentials or BSC RPC connectivity.
- `UNDERLY_CHAIN_ID` is not 56 for this BSC-first release.
- Preview or Production variable scope is incomplete or secrets are exposed to the
  client through `NEXT_PUBLIC_*`.
- Positive-wallet portfolio cannot finish within the 50-second internal deadline
  under a controlled request rate.
- Failed balance reads are rendered as zero, missing valuation is rendered as zero,
  or a partial portfolio is presented as complete.
- Continuity, Preflight, or Readiness performs automatic work without an explicit
  user action, or Readiness is promoted despite missing binding/simulation evidence.

## Production acceptance criteria

Run Preview first. Use only public BSC addresses and read-only requests. Avoid
parallel positive-wallet requests while characterizing provider rate limits.

- Landing returns a validated universe and clearly reports unavailable/partial
  provider data.
- Stock detail preserves exact wrapper contract and provider attribution; Asset
  Graph is fetched once per ticker state and stale ticker responses do not win.
- `/api/universe` returns a non-empty validated BSC wrapper set.
- A verified zero-balance wallet returns HTTP 200, zero positive positions, and
  explicit proven-zero reads; this is distinct from an empty universe.
- A verified positive-balance wallet returns exact chain/contract balances,
  Decimal quantities, and source-backed valuation/exposure. If evidence is
  incomplete, the result is `PARTIAL`, not complete.
- Exposure totals reconcile with the portfolio known-value denominator. Unknown
  valuation is excluded and visible, never converted to zero.
- Snapshot A and B show their own block, capture time, price/ratio evidence, and
  coverage. No-change data is reported as `NO OBSERVED CHANGE`; value difference
  is never labelled P&L or synchronized historical performance.
- Partial RPC reads retain failed-read counts and unknown positions. They never
  become proven zero.
- Controlled fault injection produces explicit timeout/abort/429 evidence without
  triggering real provider load. Pre-snapshot timeout is unavailable; supported
  post-snapshot degradation is explicitly partial.
- Continuity and Preflight issue no request until clicked and remain quote/build/
  simulation-only.
- Execution Readiness remains `BLOCKED` when quote/build binding, allowance, or
  simulation evidence is insufficient. Signing, approval, broadcast, and automatic
  trading remain absent.

## Controlled deployment procedure

Execute only after separate authorization.

1. Freeze the approved commit SHA and archive the local validation report.
2. Confirm the dashboard checklist and record the currently active production
   deployment ID/URL as the rollback target.
3. Create a Preview deployment from the exact approved SHA.
4. Run the acceptance criteria on Preview with bounded request volume.
5. Review build logs, Runtime Logs, Observability, stage timing, 429 rate, and
   `PARTIAL` semantics. Stop on any blocker.
6. Obtain explicit production-deployment authorization naming the approved SHA.
7. Promote/deploy that exact artifact; do not rebuild from a different working tree.
8. Run a narrow production smoke: landing, one stock detail, universe, one
   zero-balance portfolio, one positive-balance portfolio, one two-snapshot
   comparison, then explicit Continuity/Preflight/Readiness checks.
9. Observe timeout, 429, error, latency, and partial-response rates before increasing
   request volume.

Stop production testing immediately on repeated 5xx/504, duration approaching the
platform cap, sustained 429 amplification, RPC chain mismatch, unexpected failed
balance reads, evidence becoming zero, stale wallet/ticker results, secret leakage,
or any signing/approval/broadcast behavior.

## Rollback procedure

Rollback means promoting the previously recorded known-good deployment through
the Vercel dashboard. Do not rewrite Git history or use `reset`, `restore`, or
`clean` as a deployment rollback mechanism.

1. Stop smoke traffic and preserve affected request IDs/log timestamps.
2. Promote the prior known-good deployment recorded before release.
3. Verify the production domain now resolves to that deployment.
4. Re-run the minimal landing, stock-detail, and zero-balance read-only smoke.
5. Confirm error/timeout/429 rates return to the prior baseline.
6. Keep the failed deployment and logs available for diagnosis; do not delete
   evidence during the incident.

## Local checkpoint gate

Before requesting deployment authorization, require a clean result from the full
test suite, TypeScript, production build, ESLint, frozen/safety regression, and
`git diff --check`. Local success does not replace the dashboard confirmations or
Preview acceptance smoke above.

### Verification on 2026-09-24

- full suite: 478/478 PASS across 71 test files;
- TypeScript: PASS;
- production build: PASS, 22 application routes/pages;
- frozen/safety regression: 50/50 PASS;
- repository-wide ESLint: PASS with 0 errors and 3 pre-existing warnings;
- `git diff --check`: PASS;

ESLint excludes only generated output and local tooling/backup directories:
`.next`, `out`, `coverage`, `.kilo`, and `.underly-patch-backups`. Active source
and tests remain in repository-wide lint discovery.
