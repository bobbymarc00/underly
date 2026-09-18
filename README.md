# Underly

**Know what you really hold.**

Underly is a read-only tokenized-equity inspection and market-intelligence layer for BNB Smart Chain. It combines provider-aware RWA discovery, evidence-preserving fundamentals, standardized liquidity observations, current and historical corporate-action evidence, contextual news, public-address wallet inspection, and intent-aware read-only HOLD / BUY / SELL / COLLATERAL diagnostics.

The product is intentionally **evidence-first**: missing data stays missing, provider disagreement stays visible, and quote observations never become transaction execution.

## Product surfaces

```text
/                 Market terminal
/stock/[ticker]   Stock / wrapper intelligence
/wallet           Public-address wrapper holdings
/inspect          Read-only intent inspection
```

The market terminal includes:

- Hot / Gainers / Losers views
- wrapper-aware ticker detail
- provider-specific reference and fundamentals evidence
- standardized `$1,000` liquidity probes
- current ActionGuard/session evidence
- historical dividend / split evidence
- contextual market and ticker news
- on-demand read-only HOLD proof

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env.local`.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Core Binance Web3 configuration:

```env
BINANCE_WEB3_API_KEY=...
BINANCE_WEB3_SECRET=...
UNDERLY_QUOTE_WALLET=0xYOUR_PUBLIC_BSC_WALLET
UNDERLY_CHAIN_ID=56
```

Optional enrichment:

```env
UNDERLY_NEWS_PROVIDER=alpha_vantage
ALPHAVANTAGE_API_KEY=...
UNDERLY_RPC_URL=https://YOUR_BSC_RPC
```

`UNDERLY_QUOTE_WALLET` and wallet-inspector addresses are **public addresses only**. Underly never requests or uses a seed phrase or private key.

### 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## API surface

Frozen v0.1 inspection contract:

```text
POST /api/firewall/check
GET  /api/search
```

Frozen v0.2 additive data foundation:

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

Post-freeze market-terminal helper:

```text
GET /api/landing-rankings
```

The landing-rankings route is an additive presentation/data-selection endpoint; it does not alter the frozen v0.1 firewall contract or the v0.2 read-only boundary.

See:

- `docs/API_V0.2.md`
- `docs/SCHEMA_FREEZE_V0.2.md`
- `docs/ARCHITECTURE.md`
- `docs/MARKET_TERMINAL.md`
- `docs/PROJECT_STATE_2026-09-19.md`

## Evidence semantics

### Resolved fundamentals

Provider evidence is resolved as:

- `CONSENSUS`
- `SINGLE_SOURCE`
- `CONFLICT`
- `UNKNOWN`

Numeric canonicalization prevents formatting-only differences such as `779.3700` vs `779.37` from becoming false conflicts. Genuine numeric disagreement remains `CONFLICT`.

Underly does not choose a winner for ordinary resolved fundamentals such as market cap, P/E, P/B, 52-week high/low, or latest dividend when provider values genuinely disagree.

### Headline reference

The stock-detail **headline reference** is intentionally different from cross-provider fundamental resolution.

Selection order:

1. prefer a valid wrapper reference sourced from `UNDERLYING_MARKET`
2. otherwise fall back to `RWA_PRICE`
3. within the same source class use deterministic provider ordering
4. show the selected headline as `SINGLE SOURCE`

Wrapper rows still show each provider's own reference and provenance, so disagreement is not hidden.

### Dividend yield

Raw provider values are preserved. Underly adds a normalized percentage-point value only for verified provider conventions. It does not silently annualize or recompute dividend yield.

### HOLD proof

Missing integrity evidence is never converted to PASS. For example, when reference data is available but daily/monthly attestation metadata is unknown, wrapper integrity remains `UNKNOWN` and the finding explicitly names the missing attestation fields.

## Landing rankings

The landing market mosaic is intentionally bounded and evidence-aware.

- **Hot** uses Binance token-list `volume24H`; it does not require liquidity probing.
- **Gainers / Losers** are lazy-loaded when selected.
- mover discovery uses a two-stage process:
  - primary candidate discovery
  - second-wrapper verification for the strongest candidates
- multi-wrapper consensus requires matching direction and a bounded spread
- single-source movers are allowed only when the reference-price guard passes
- no permanent "best wrapper" ranking is produced from transient quote snapshots

## Liquidity semantics

`GET /api/liquidity` runs a current standardized quote observation:

```text
USDT benchmark -> wrapper quote -> full synthetic reverse quote
```

`roundTrip.frictionPct` answers approximately:

> If the benchmark notional were quoted into the wrapper and immediately quoted back out at the current route snapshot, what percentage of the benchmark would be lost?

It is a quote-level observation, not realized wallet P&L and not a promise about a future execution.

## Read-only boundary

Underly may request signed **read-only Binance Web3 data/quote endpoints** and public EVM JSON-RPC reads. It does not expose or perform:

- swap/trade execution
- token approvals
- transaction signing
- transaction broadcast
- private-key or seed-phrase handling

The wallet inspector uses only `eth_chainId`, `eth_blockNumber`, and `eth_call`, and inspects only wrapper contracts present in the Binance Web3 RWA universe.

## Historical chart safety

Current token/share-ratio direction is live-verified, but historical ratio continuity is not. Therefore supported historical chart modes remain:

- raw token price
- indexed 100

Historical share-adjusted mode remains intentionally deferred until timestamped ratio continuity is evidenced.

## Failure / privacy behavior

- missing upstream evidence is never fabricated
- failed wallet reads are not converted into zero balances
- optional news/history provider failures are sanitized before reaching the UI
- provider secrets and raw credential-bearing errors are not exposed
- RPC URLs are not returned in wallet-inspector responses

## Validation snapshot

Local freeze validation on **2026-09-19**:

```text
Targeted headline/evidence tests: 18/18 PASS
Full suite:                      214/214 PASS
Production build:                PASS
TypeScript:                      PASS
git diff --check:                PASS
Runtime stock detail:            PASS
Reference fallback:              PASS
Headline SINGLE SOURCE:          PASS
HOLD proof clarity:              PASS
```

The pre-docs local freeze record is stored in:

```text
docs/freeze/LOCAL_FREEZE_2026-09-19.txt
```

## Vercel

Add required variables in **Vercel Project Settings -> Environment Variables**. Never rename server secrets to `NEXT_PUBLIC_*`.

## Current state / handoff

For development continuation or a new ChatGPT session, read:

```text
docs/PROJECT_STATE_2026-09-19.md
```

before changing code. It records the frozen behavior, validation state, design decisions, and intentionally deferred work.
