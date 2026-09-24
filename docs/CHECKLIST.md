# Underly Build Checklist

This is the authoritative project checklist.

## v0.1 — frozen production baseline

- [x] Next.js + TypeScript server-only backend
- [x] Signed Binance Web3 reads with bounded retry
- [x] `/api/search`
- [x] `/api/firewall/check` schema frozen
- [x] multi-wrapper resolution / platform filtering / direct contract path
- [x] decimal-string financial transport
- [x] BUY / HOLD / SELL / COLLATERAL quantity semantics
- [x] deterministic findings + ActionGuard + proof
- [x] missing evidence does not become PASS
- [x] production validation completed on the accepted deployment region

Historical v0.1 test-count notes in older milestone documents remain historical evidence; current regression totals are tracked by the current test run.

## v0.2 — market-data foundation

### Wrapper universe
- [x] provider-agnostic `/api/universe`
- [x] dynamic provider enumeration
- [x] unknown/future provider IDs preserved
- [x] wrapper contract deduplication
- [x] decimals + token/share-ratio metadata preserved

### Historical market data
- [x] wrapper historical/candle coverage
- [x] normalized intervals/timestamps
- [x] missing samples remain missing
- [x] raw token-price chart mode
- [x] indexed-100 comparison mode
- [x] current token/share-ratio direction live-verified
- [ ] historical share-adjusted mode — **DEFERRED: ratio continuity not verified**
- [ ] timestamped historical ratio/reference baseline — deferred until authoritative evidence exists

### Company profile & fundamentals
- [x] company name / description
- [x] industry
- [x] website
- [x] market cap
- [x] 52-week high / low
- [x] volume / average daily volume where supplied
- [x] P/E / P/B
- [x] dividend yield / latest dividend metadata
- [x] `CONSENSUS | SINGLE_SOURCE | CONFLICT | UNKNOWN`
- [x] unavailable fields remain null/UNKNOWN
- [ ] separate sector field — optional/deferred when not supplied distinctly

### Liquidity intelligence
- [x] standardized same-notional read-only probe
- [x] current entry route evidence
- [x] current reverse/exit route evidence
- [x] quote vendor
- [x] round-trip friction/recovery
- [x] reported volume preserved with comparability warning
- [x] no provider ranking / no UI-owned risk threshold
- [ ] broader benchmark-size/session empirical matrix — non-contract validation, deferred

### Dividends & corporate actions
- [x] current ActionGuard kept separate from history
- [x] current dividend snapshot + verified yield normalization
- [x] provider-neutral historical timeline
- [x] historical dividend events
- [x] historical stock-split events
- [x] raw/source evidence preserved
- [x] future declared dividends excluded from history
- [ ] mergers/reorganizations — deferred until authoritative evidence exists
- [ ] symbol changes/suspensions timeline — deferred until authoritative evidence exists
- [ ] wrapper-vs-underlying historical reconciliation — future enhancement

### Related news
- [x] provider abstraction
- [x] Alpha Vantage adapter
- [x] shared cached provider snapshot
- [x] market landing scope
- [x] exact-ticker detail scope
- [x] latest/relevance ordering
- [x] source URL/timestamp/headline/topics preserved
- [x] no generated/fabricated article content

### Read-only wallet inspector
- [x] public EVM address input
- [x] chain-ID verification
- [x] one explicit block snapshot
- [x] tokenized-equity wrapper allow-set from Binance universe
- [x] ERC-20 `balanceOf` through `eth_call`
- [x] raw balance + base units + normalized quantity
- [x] failed read distinct from zero
- [x] holdings mapped to wrapper/ticker/provider metadata
- [x] no signing / approvals / transaction broadcast
- [x] live BSC smoke: 488 wrapper reads, 0 failed reads on accepted validation snapshot

### v0.2 freeze audit
- [x] v0.1 firewall remains untouched
- [x] no write-capable wallet RPC surface
- [x] Binance aggregator integration is quote-only
- [x] local secrets are gitignored
- [x] installer backup pattern is gitignored
- [x] authoritative docs reconciled with implemented endpoints
- [x] historical share-adjusted mode explicitly excluded from frozen contract
- [ ] freeze-candidate patch full regression suite — run after applying patch
- [ ] freeze-candidate production build — run after applying patch

## Deferred proof / agent layer

- [ ] canonical proof serialization v2
- [ ] explicit cross-endpoint source manifest
- [ ] deterministic standalone verification tooling
- [ ] optional on-chain proof anchoring
- [ ] agent/x402 layer

These are not blockers for freezing the v0.2 market-data foundation.

## Next milestone — final stock-exchange UI

- [ ] market-terminal visual system
- [ ] provider-agnostic multi-wrapper chart
- [ ] raw / indexed-100 modes
- [ ] share-adjusted mode remains disabled until historical ratio continuity is evidenced
- [ ] overview / wrappers / liquidity / fundamentals
- [ ] dividends & corporate-actions timeline
- [ ] ActionGuard / deterministic findings
- [ ] evidence / proof
- [ ] current news
- [ ] optional public-wallet holdings view
- [ ] responsive/mobile terminal UX
- [ ] final demo polish

## Product boundary

Underly remains read-only. Deferred unless an explicit future product decision changes the boundary:

- real swap/trade execution
- wallet private keys / seed phrases
- token approvals
- transaction signing/broadcast

## v0.8-A — exposure intelligence

- [x] empty BSC wrapper universe fails closed before balance reads
- [x] proven-zero wallet remains distinct from missing universe coverage
- [x] pure deterministic exposure engine with no network calls
- [x] verified-underlying breakdown
- [x] exact chain-and-contract wrapper breakdown
- [x] source-provider breakdown without issuer inference
- [x] known-value denominator and `knownValueWeightPct`
- [x] partial/unknown valuation coverage remains explicit
- [x] duplicate wrapper identity cannot be double-counted
- [x] Decimal precision and deterministic sorting
- [x] additive `/api/portfolio` response and runtime UI validation
- [x] minimal wallet exposure overview
- [x] no automatic quote, build, simulation, Continuity, signing, approval, or broadcast

## v0.9-A — portfolio snapshot comparison

- [x] two separately captured, runtime-validated `/api/portfolio` responses
- [x] same normalized wallet address and chain required
- [x] exact chain ID + contract address position identity
- [x] verified underlying identity reused from v0.8
- [x] deterministic Decimal-only quantity, share, price, and value differences
- [x] snapshot-specific ratio and price; no retroactive normalization
- [x] proven zero, unknown balance, and universe coverage gap remain distinct
- [x] metadata/evidence conflicts block affected comparison dimensions
- [x] comparable known-value subtotal uses only mutually valued exact wrappers
- [x] snapshot totals and their original valuation coverage remain separate
- [x] same/reversed block and unavailable timestamp semantics are explicit
- [x] client-supplied provenance and non-persistence are explicit
- [x] manual capture A/B and comparison in browser-session memory only
- [x] wallet changes abort stale requests and clear old snapshots/results
- [x] no localStorage, database, background polling, synthetic history, or P&L
- [x] no automatic quote, build, simulation, Continuity, signing, approval, or broadcast

## v1.0-A — product integration

- [x] Discover through Readiness journey is discoverable without false active controls
- [x] wallet/ticker changes clear or isolate stale asynchronous state
- [x] Continuity, Preflight, and Readiness require explicit user actions
- [x] wrapper selection preserves exact contract and provider identity
- [x] provider is not presented as issuer or legal-rights evidence
- [x] Execution Readiness remains distinct from execution capability
- [x] provider limitations remain visible and do not promote `BLOCKED` to ready

## v1.0-B — production reliability

- [x] portfolio route declares a 60-second source duration and a 50-second internal deadline
- [x] RPC/provider operations use bounded timeouts and propagated cancellation
- [x] 429 retry waits are cancellable and actual HTTP attempts are observable
- [x] pre-snapshot timeout fails explicitly without an invented snapshot
- [x] post-snapshot enrichment failure becomes `PARTIAL` only with sufficient evidence
- [x] every balance read still uses one explicit block tag
- [x] stock detail shares one stale-safe Asset Graph discovery request
- [x] no automatic quote, build, simulation, signing, approval, or broadcast

## v1.0-C — deployment readiness verification

- [x] checkpoint contents and exclusions reviewed
- [x] source-verifiable deployment configuration documented
- [ ] Vercel project, Production Branch, plan, and Fluid Compute confirmed in dashboard
- [ ] effective `/api/portfolio` duration and Function region confirmed in dashboard
- [ ] Production and Preview environment-variable scopes confirmed without exposing values
- [ ] Preview acceptance smoke completed
- [ ] separate production-deployment authorization received
- [ ] production smoke and rollback observation window completed

See `docs/DEPLOYMENT_READINESS_V1.0-C.md`. No deployment is authorized by this checklist.

## v1.0-D — final lint gate

- [x] local `.kilo` worktrees excluded from lint discovery
- [x] local `.underly-patch-backups` excluded from lint discovery
- [x] active `src`, `app`, and `tests` remain linted
- [x] provider-filter reconciliation preserves selection and missing-provider reset
- [x] empty/exact-contract search input clears discovery through the input event
- [x] repository-wide ESLint passes with no errors
- [x] regression tests cover the lint-safe state transitions
