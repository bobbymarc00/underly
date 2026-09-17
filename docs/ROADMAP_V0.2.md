# Underly v0.2 Roadmap — Market Data Foundation

Status: **FOUNDATION IMPLEMENTED / FREEZE CANDIDATE**

Underly v0.1 remains frozen and production-stable. v0.2 expands beside `/api/firewall/check` rather than changing that contract.

## Product direction

Underly is a read-only tokenized-equity market, wrapper, evidence, and public-wallet intelligence product.

> Know what you really hold.

## Completed foundation

### 1. Wrapper Universe — COMPLETE

`GET /api/universe`

- dynamic provider discovery
- underlying-to-wrapper grouping
- provider/wrapper counts
- contract/symbol/chain/decimals/token-share-ratio metadata
- unknown provider IDs retained

### 2. Historical Market Data — COMPLETE FOR SAFE MODES

`GET /api/market-history`

Frozen safe modes:

- raw wrapper token price
- indexed-to-100 comparison

Historical share-adjusted comparison is **not** frozen because current ratio direction is verified but historical ratio continuity is not.

### 3. Company Profile & Fundamentals — COMPLETE FOUNDATION

`GET /api/company`

Evidence-aware company and fundamental fields with explicit consensus/conflict/unknown semantics.

### 4. Wrapper Liquidity Intelligence — COMPLETE FOUNDATION

`GET /api/liquidity`

Current standardized same-notional entry/reverse quote observations, vendor and friction evidence. Live outcomes remain time/size/session dependent and are never frozen values.

### 5. Dividends & Corporate Actions — COMPLETE CURRENT + DIVIDEND/SPLIT HISTORY

`GET /api/corporate-actions`

Current ActionGuard/session + dividend snapshot.

`GET /api/corporate-actions/history`

Historical provider-neutral dividends and stock splits with raw evidence.

Deferred until authoritative evidence exists:

- mergers/reorganizations
- symbol changes/suspensions history
- historical wrapper-vs-underlying reconciliation

### 6. Related News — COMPLETE FOUNDATION

`GET /api/news`

Provider abstraction, shared cached market snapshot, market scope, and exact-ticker evidence filtering.

### 7. Read-only Wallet Inspector — COMPLETE FOUNDATION

`GET /api/wallet-inspector`

- public address only
- Binance RWA universe defines inspectable wrapper contracts
- same-block ERC-20 `balanceOf`
- raw + normalized quantity evidence
- no seed phrase/private key/signing/approval/broadcast

## Deferred layers

### Proof v2 / Agent Layer

Deferred beyond the v0.2 market-data freeze:

- stronger canonical proof serialization
- cross-endpoint source manifest
- standalone deterministic verification tooling
- optional on-chain proof anchoring
- agent/x402 surfaces

## Next milestone

### Final stock-exchange UI

The backend foundation is now ready for the final market-terminal UI, subject to the freeze-candidate regression/build validation.

The UI must consume normalized backend contracts and must not:

- recompute risk findings
- infer PASS from missing evidence
- create write capabilities
- fabricate news or corporate actions
- silently apply today's token/share ratio across historical candles

Historical chart modes exposed by the frozen backend are raw and indexed-100. Share-adjusted historical visualization remains deferred until ratio continuity is evidenced.

## Non-goal

Real swap/trade execution is not part of the v0.2 product boundary.
