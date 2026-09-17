# Underly

**Know what you really hold.**

Underly is a zero-install tokenized-equity inspection layer for BNB Smart Chain. It combines asset identity, wrapper metadata, token/reference pricing, session state, current execution diagnostics and conservative valuation into one read-only API response.

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env.local` and fill in your Binance Web3 Developer credentials.

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Linux/macOS:

```bash
cp .env.example .env.local
```

Required:

```env
BINANCE_WEB3_API_KEY=...
BINANCE_WEB3_SECRET=...
UNDERLY_QUOTE_WALLET=0xYOUR_PUBLIC_BSC_WALLET
UNDERLY_CHAIN_ID=56
```

`UNDERLY_QUOTE_WALLET` is a **public address only** used for Binance RFQ context. No seed phrase or private key is used by v0.1.

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Test API

```bash
curl -X POST http://localhost:3000/api/firewall/check \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"NVDA","intent":"BUY","amountUsd":"1000"}'
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/firewall/check `
  -ContentType 'application/json' `
  -Body '{"ticker":"NVDA","intent":"BUY","amountUsd":"1000"}'
```

## Vercel

Add the same environment variables in Vercel Project Settings â†’ Environment Variables. **Never** rename Binance secrets to `NEXT_PUBLIC_*`.

## Security

- Binance credentials are imported only from modules marked `server-only`.
- v0.1 does not sign wallet transactions or broadcast trades.
- `.env*` local secrets are gitignored.

## Execution semantics

Underly v0.1 is intent-aware:

- `BUY` — current entry quote + full reverse liquidity probe.
- `HOLD` — no synthetic execution.
- `SELL` — direct current exit quote using exact `tokenAmount` when supplied, otherwise an `amountUsd` fallback.
- `COLLATERAL` — direct current liquidation-value analysis using the same quantity semantics.

Execution diagnostics measure current conditions, not predicted future return.

Underly is read-only and does not discover wallet holdings, sign transactions, approve tokens, or broadcast trades.

See `docs/PRODUCT_SPEC.md`, `docs/API.md`, and `docs/DX_LOG.md`.
