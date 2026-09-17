# Underly Build Checklist

This is the authoritative project checklist.

## Foundation
- [x] Windows + VS Code development
- [x] Next.js 16 + TypeScript
- [x] Server-only Binance credentials
- [x] Signed Binance Web3 requests
- [x] Bounded `42900` retry with fresh signature
- [x] Decimal-string financial transport
- [x] Vitest regression suite
- [x] Production build

## Discovery / data
- [x] `/api/search`
- [x] Dynamic RWA discovery
- [x] Multiple BSC wrappers
- [x] Platform filtering
- [x] Direct `contractAddress` resolution
- [x] Token/reference prices
- [x] Market/session state
- [x] Wrapper/profile metadata
- [x] Attestation metadata

`/api/asset/[contract]` from the early blueprint is superseded by `contractAddress` support on `/api/firewall/check`; no separate endpoint is required for v0.1.

## Underly core
- [x] Asset Passport
- [x] Wrapper Integrity
- [x] Reference divergence
- [x] Conservative valuation
- [x] Deterministic findings
- [x] Source provenance
- [x] SHA-256 Underly Proof
- [x] ActionGuard `CLEAR | ACTIVE | UNKNOWN`
- [x] Missing data != PASS

## Intent engine
- [x] BUY — entry + reverse liquidity probe
- [x] HOLD — no synthetic execution
- [x] SELL — exact `tokenAmount` or USD-notional fallback
- [x] COLLATERAL — exact `tokenAmount` or USD-notional fallback
- [x] `quantitySource` provenance
- [x] Entry / exit / round-trip breakdown
- [x] Favorable delta separated from friction
- [x] Compatibility haircut fields retained

## API contract
- [x] `/api/firewall/check` schema v0.1 frozen
- [x] `/api/search` contract regression-tested
- [x] Exact `tokenAmount` semantics
- [x] `contractAddress` path
- [x] Multi-wrapper isolation
- [x] Platform filtering
- [x] Fail-closed upstream fixture
- [x] Proof hash independently recomputed
- [x] 7 test files / 39 tests passing
- [x] Next.js production build passing

## Production validation
- [x] Vercel deployment
- [x] Binance Web3 production connectivity
- [x] Vercel Function Region `sin1`
- [x] `/api/search?q=NVDA`
- [x] BUY production smoke
- [x] HOLD production smoke
- [x] SELL exact `tokenAmount=4.5`
- [x] COLLATERAL exact `tokenAmount=4.5`
- [x] Direct contract resolution
- [x] `platform=bstock`
- [x] AOSL non-trading-session finding
- [x] VZ reference-divergence finding
- [x] Production proof hash + proofId verification

TEL previously demonstrated high execution friction; the latest production snapshot did not cross that finding threshold. Execution friction is intentionally live and may change with liquidity.

## Production infrastructure observation
Vercel `iad1` returned Binance Web3 business code `40304` (`Service not available due to compliance restriction`) for the RWA service. Running the production Function in Vercel `sin1` restored successful RWA access. This is recorded as an observed deployment constraint, not as application risk logic.

## UI
- [x] Minimal debug UI
- [ ] Final GG UI
- [ ] Intent-aware input UX
- [ ] Asset search experience
- [ ] Wrapper comparison
- [ ] Passport visualization
- [ ] Session / reference visualization
- [ ] Execution-friction visualization
- [ ] Conservative valuation visualization
- [ ] ActionGuard visualization
- [ ] Deterministic findings UX
- [ ] Sources / proof receipt
- [ ] Responsive/mobile polish
- [ ] Final demo polish

## Deferred beyond v0.1
- [ ] Automatic wallet holdings discovery
- [ ] Real transaction execution
- [ ] Full legal-rights database
- [ ] Full corporate-action calendar/reconciliation
- [ ] On-chain proof anchoring
- [ ] Agent Studio / x402
