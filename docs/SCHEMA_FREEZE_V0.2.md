# Underly v0.2 Schema Freeze Record

Status: **FROZEN**

Pre-freeze implementation baseline:

```text
8c18464e4a56fbedca9ac77733db42e52733f9fe
feat: add read-only wallet inspector
```

The freeze becomes authoritative after this patch is applied and the full test suite plus production build pass again.

## What is being frozen

The freeze covers:

- endpoint presence and request intent
- response-field semantics
- evidence/failure-state semantics
- read-only security boundary
- current ActionGuard vs historical-event separation
- provider-agnostic wrapper behavior
- safe historical chart modes
- wallet-inspector snapshot semantics

The freeze does **not** freeze live market values, wrapper inventory, provider availability, quotes, liquidity outcomes, article lists, corporate events that have not occurred yet, or wallet balances.

## Frozen endpoint surface

v0.1 unchanged:

```text
GET  /api/search
POST /api/firewall/check
```

v0.2 additive:

```text
GET /api/universe
GET /api/market-history
GET /api/company
GET /api/liquidity
GET /api/corporate-actions
GET /api/corporate-actions/history
GET /api/news
GET /api/wallet-inspector
```

## Read-only boundary

Frozen guarantees:

- no swap/trade execution endpoint in Underly
- no ERC-20 approval path
- no private-key/seed handling
- no transaction signing/broadcast
- Binance aggregator usage is quote-only
- wallet RPC exposes only `eth_chainId`, `eth_blockNumber`, and `eth_call`
- RPC URL is server-only configuration and is not returned in API payloads

The freeze regression test statically guards the currently accepted code surface against accidental introduction of common transaction/signing methods.

## Historical market contract

Frozen:

- raw wrapper candles
- indexed-100 mode
- `null` for aligned missing samples
- no invented interpolation

Not frozen / intentionally deferred:

- historical share-adjusted mode
- historical ratio continuity assumption
- arbitrary underlying/reference historical baseline

Reason: current token/share-ratio direction is verified, but historical ratio continuity is not. Applying today's ratio to past candles would be an unsupported inference.

## Corporate-action contract

Current endpoint:

```text
/api/corporate-actions
```

remains current Binance-backed ActionGuard/session/dividend snapshot evidence.

Historical endpoint:

```text
/api/corporate-actions/history
```

is separate and currently supports sourced:

- dividends
- stock splits

No merger, reorganization, symbol-change, or suspension history is claimed without authoritative source evidence.

## Wallet-inspector contract

Scope is `TOKENIZED_EQUITY_WRAPPERS_ONLY`.

- input: public EVM address
- chain must match configured chain
- wrapper membership comes from Binance Web3 RWA universe
- one explicit block tag per request
- every `balanceOf` uses the same block
- zero balance and failed read are distinct
- only non-zero successful reads become holdings
- holdings retain raw balance evidence

The wallet inspector does not automatically mutate or bypass the v0.1 firewall contract.

## Optional-provider semantics

News and historical corporate actions are optional enrichment layers. Missing optional provider configuration may be represented in a normal response with `NOT_CONFIGURED` and no fabricated evidence.

Wallet RPC configuration is required for `/api/wallet-inspector`; its absence maps to HTTP 503 `NOT_CONFIGURED`.

## Validation basis before freeze patch

Accepted implementation evidence immediately before this freeze patch:

- full regression suite: 118/118 passing
- Next.js production build passing
- wallet live BSC smoke: chain 56, 488 wrappers checked, 0 failed reads
- historical corporate-actions smoke: evidence-preserving `PARTIAL` behavior accepted
- current ActionGuard remained separate from historical events

## Required validation after applying this patch

```powershell
npx vitest run tests/v02-freeze-boundary.test.ts
npm test
npm run build
git diff --check
```

If all pass, commit the freeze patch and treat that commit as the v0.2 frozen backend baseline for final UI development.

## Deferred beyond freeze

- historical share-adjusted charts
- mergers/reorganizations/symbol-change historical sources
- broader empirical liquidity size/session matrix
- Proof v2 / agent layer
- trade execution
