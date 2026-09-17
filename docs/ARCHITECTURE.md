# Underly Architecture

## Boundary

Underly is a **read-only inspection and intelligence system**. It may fetch market data, request quote observations, and read public on-chain state. It does not submit trades, approvals, signed transactions, or broadcasts.

## Layers

`src/lib/binance/`
: Server-only Binance Web3 transport/adapters. Signed requests are data/quote reads. Product-risk decisions do not live here.

`src/lib/underly/`
: Deterministic Underly product logic: passport, integrity, intent-aware execution diagnostics, valuation, findings, proof, dividend normalization, and standardized liquidity observation.

`src/lib/rules/`
: Explicit product-policy thresholds used by deterministic findings.

`src/lib/news/`
: Provider-neutral contextual-news abstraction and provider adapter/cache.

`src/lib/corporate-actions/`
: Provider-neutral historical corporate-action timeline. This remains separate from current Binance ActionGuard/session status.

`src/lib/wallet/`
: Public-address wallet inspection. The RPC adapter exposes only `eth_chainId`, `eth_blockNumber`, and ERC-20 `balanceOf` through `eth_call`.

`src/app/api/`
: Request validation, orchestration, response schema, and HTTP status mapping.

`src/app/` + `src/components/`
: Presentation. UI code must not recompute backend findings, invent missing evidence, or introduce write capabilities.

## Frozen v0.1 core

`POST /api/firewall/check` remains the v0.1 frozen inspection contract.

Intent-aware execution diagnostics:

```text
BUY
 USDT -> token quote -> full reverse quote -> current entry/exit observation

HOLD
 no synthetic execution call

SELL / COLLATERAL
 exact tokenAmount OR explicit USD-notional fallback
 -> token -> USDT direct quote
 -> conservative/current liquidation observation
```

These are quote observations only. `src/lib/binance/trading.ts` uses the Binance aggregator **quote** endpoint and does not expose a swap/execute path.

## v0.2 additive data flow

```text
Binance Web3 RWA universe
        |
        +--> market history
        +--> company/fundamentals
        +--> liquidity quote observations
        +--> current ActionGuard/dividend snapshot
        |
        +--> wallet contract allow-set
                 |
public address -> EVM JSON-RPC balanceOf snapshot

Alpha Vantage (optional)
        |
        +--> contextual news
        +--> historical dividends/splits
```

## Evidence separation

- current ActionGuard != historical corporate-action timeline
- failed wallet read != zero balance
- missing chart sample != zero
- company-source conflict != consensus
- current ratio semantics != historical ratio continuity
- quote observation != trade execution
- provider metadata != Underly-generated fact

## Historical chart safety

Current token/share-ratio direction is verified, but historical continuity is not. v0.2 therefore freezes raw and indexed-100 historical modes only. Historical share-adjusted charts remain deferred.
