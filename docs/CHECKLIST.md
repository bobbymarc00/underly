# Underly Build Checklist

This is the authoritative project checklist.

## v0.1 — production baseline

### Foundation
- [x] Windows + VS Code development
- [x] Next.js 16 + TypeScript
- [x] Server-only Binance credentials
- [x] Signed Binance Web3 requests
- [x] Bounded `42900` retry with fresh signature
- [x] Decimal-string financial transport
- [x] Vitest regression suite
- [x] Production build

### Discovery / data
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

### Underly core
- [x] Asset Passport
- [x] Wrapper Integrity
- [x] Reference divergence
- [x] Conservative valuation
- [x] Deterministic findings
- [x] Source provenance
- [x] SHA-256 Underly Proof
- [x] ActionGuard `CLEAR | ACTIVE | UNKNOWN`
- [x] Missing data != PASS

### Intent engine
- [x] BUY — entry + reverse liquidity probe
- [x] HOLD — no synthetic execution
- [x] SELL — exact `tokenAmount` or USD-notional fallback
- [x] COLLATERAL — exact `tokenAmount` or USD-notional fallback
- [x] `quantitySource` provenance
- [x] Entry / exit / round-trip breakdown
- [x] Favorable delta separated from friction
- [x] Compatibility haircut fields retained

### API contract
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

### Production validation
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

### Production infrastructure observation

Vercel `iad1` returned Binance Web3 business code `40304` (`Service not available due to compliance restriction`) for the RWA service. Running the production Function in Vercel `sin1` restored successful RWA access. This is an observed deployment constraint, not application risk logic.

## v0.2 — Market Data Foundation

### Wrapper Universe
- [ ] Apply and validate provider-agnostic `/api/universe`
- [ ] Confirm live provider enumeration on `sin1`
- [ ] Confirm unknown/future provider IDs are preserved
- [ ] Freeze the v0.2 universe response after live validation

### Historical market data
- [ ] Validate historical/candle source coverage per wrapper provider
- [ ] Define intervals and timestamp normalization
- [ ] Preserve missing samples as missing
- [ ] Add raw token-price series
- [ ] Verify token/share-ratio semantics before share-adjusted chart mode
- [ ] Add indexed-100 comparison mode
- [ ] Add optional underlying/reference baseline series
- [ ] Regression tests for multi-provider time series

### Company profile & fundamentals
- [ ] Company description
- [ ] Industry / sector
- [ ] Website
- [ ] Market cap
- [ ] 52-week high / low
- [ ] Volume / average daily volume
- [ ] P/E
- [ ] P/B
- [ ] Dividend yield
- [ ] Latest dividend metadata
- [ ] Explicit UNKNOWN/null semantics

### Liquidity intelligence
- [ ] Market/on-chain volume where supported
- [ ] Current entry route availability
- [ ] Current exit route availability
- [ ] Quote vendor
- [ ] Execution friction
- [ ] Executable / liquidation value
- [ ] Evaluate standardized read-only probe sizes
- [ ] No UI-owned risk threshold

### Dividends & corporate actions
- [ ] Dedicated event model
- [ ] Dividend events
- [ ] Split events
- [ ] Merger/reorganization events
- [ ] Symbol changes / suspensions where evidenced
- [ ] Keep timeline separate from ActionGuard
- [ ] Future wrapper reconciliation: `MATCH | MISMATCH | UNKNOWN`

### Related news
- [ ] Define `NewsProvider` abstraction
- [ ] Select authoritative/current news source
- [ ] Headline + source + URL + published timestamp
- [ ] Latest-first ordering
- [ ] No generated/fabricated news
- [ ] Keep news outside Binance adapter unless Binance provides a suitable endpoint

### Read-only wallet inspector
- [ ] Public address input
- [ ] Discover tokenized-equity holdings
- [ ] Map holdings to wrapper universe
- [ ] Use actual quantity for inspection
- [ ] No signing / approvals / transaction broadcast

### Proof / agent layer
- [ ] Canonical proof serialization v2
- [ ] Explicit source manifest
- [ ] Deterministic verification tool
- [ ] Optional on-chain anchoring later
- [ ] Agent-friendly contract / x402 later

## Final stock-exchange UI

The current GG UI prototype is not a final constraint. Final UI begins after the v0.2 market-data contracts are stable.

- [ ] Stock-exchange / market-terminal visual system
- [ ] Multi-wrapper line chart in one field
- [ ] Stable distinct provider colors (presentation only)
- [ ] Preferred initial palette: bStocks yellow, Ondo orange
- [ ] Provider-agnostic legend with 3+ wrapper support
- [ ] Raw / share-adjusted / indexed comparison modes
- [ ] Overview
- [ ] Wrapper metadata
- [ ] Liquidity
- [ ] Company profile / fundamentals
- [ ] Dividends / corporate actions
- [ ] ActionGuard / deterministic findings
- [ ] Evidence / proof
- [ ] Current related stock news
- [ ] Responsive/mobile market-terminal UX
- [ ] Final demo polish

## Product boundary

Underly remains read-only.

Deferred unless a future explicit product decision changes the boundary:

- real swap/trade execution
- wallet private keys / seed phrases
- token approvals
- transaction signing/broadcast
