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
