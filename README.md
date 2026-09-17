# Underly

**Know what you really hold.**

Underly is a read-only tokenized-equity inspection and market-intelligence layer for BNB Smart Chain. The frozen v0.1 firewall contract remains intact while v0.2 adds provider-agnostic market data, company/fundamental evidence, liquidity observations, corporate-action history, contextual news, and public-address wallet inspection.

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

Optional/enrichment configuration:

```env
UNDERLY_NEWS_PROVIDER=alpha_vantage
ALPHAVANTAGE_API_KEY=...
UNDERLY_RPC_URL=https://YOUR_BSC_RPC
```

`UNDERLY_QUOTE_WALLET` and wallet-inspector input addresses are **public addresses only**. Underly never requests or uses a seed phrase or private key.

### 3. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Frozen/additive API surface

The v0.1 firewall remains frozen:

```text
POST /api/firewall/check
GET  /api/search
```

The v0.2 market-data foundation is additive:

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

See `docs/API_V0.2.md` and `docs/SCHEMA_FREEZE_V0.2.md`.

## Read-only boundary

Underly may request signed **read-only Binance Web3 data/quote endpoints** and public EVM JSON-RPC reads. It does not expose or perform:

- swap/trade execution
- token approvals
- transaction signing
- transaction broadcast
- private-key or seed-phrase handling

The wallet inspector uses only `eth_chainId`, `eth_blockNumber`, and `eth_call`, and inspects only wrapper contracts present in the Binance Web3 RWA universe.

## Historical chart safety

Current token/share-ratio direction is live-verified, but historical ratio continuity is not. Therefore the frozen historical chart modes are:

- raw token price
- indexed 100

A historical share-adjusted mode is intentionally deferred until ratio continuity or timestamped ratio history is evidenced.

## Validation

```bash
npm test
npm run build
```

The v0.2 freeze adds a static regression test that guards the read-only execution boundary and blank secret placeholders.

## Vercel

Add required environment variables in **Vercel Project Settings → Environment Variables**. Never rename server secrets to `NEXT_PUBLIC_*`.

## Security notes

- Binance credentials are consumed only from server-side modules.
- `.env`, `.env.local`, and `.env.*.local` are gitignored.
- RPC URLs are not returned in wallet-inspector responses because provider URLs may contain credentials.
- Missing upstream evidence is not silently converted into a PASS, zero holding, fabricated event, or generated article.
