# Underly Architecture

## Boundary

Underly is a **read-only inspection and intelligence system**. It may fetch market data, request quote observations, and read public on-chain state. It does not submit trades, approvals, signed transactions, or broadcasts.

The v0.1 firewall contract and the v0.2 additive read-only backend remain the safety baseline. Market-terminal work after the backend freeze is additive and must not weaken that boundary.

## Layers

`src/lib/binance/`
: Server-only Binance Web3 transport/adapters. Signed requests are data/quote reads. Product-risk decisions do not live here.

`src/lib/underly/`
: Deterministic Underly product logic: passport, integrity, intent-aware execution diagnostics, valuation, findings, proof, dividend normalization, numeric evidence canonicalization, standardized liquidity observation, and landing-ranking evidence rules.

Important current modules:

```text
evidence.ts         numeric evidence equivalence / canonicalization
landing-ranking.ts  bounded Hot / Gainers / Losers selection rules
dividend.ts         provider-convention normalization
engine.ts           frozen firewall orchestration
findings.ts         explicit evidence/risk findings
passport.ts         wrapper metadata / attestation completeness
```

`src/lib/ui/`
: Presentation-specific data contracts and deterministic UI selection helpers.

```text
reference-selection.ts
```

selects a single canonical **headline reference** without rewriting or hiding wrapper-level evidence.

`src/lib/rules/`
: Explicit deterministic product-policy thresholds.

`src/lib/news/`
: Provider-neutral contextual-news abstraction, cache, and public error sanitization.

```text
public-error.ts
```

ensures raw provider/configuration failures do not leak internal details into public UI responses.

`src/lib/corporate-actions/`
: Provider-neutral historical corporate-action timeline. This remains separate from current Binance ActionGuard/session status.

`src/lib/wallet/`
: Public-address wallet inspection. RPC access is restricted to chain/block reads and ERC-20 `balanceOf` through `eth_call`.

`src/app/api/`
: Request validation, orchestration, response schema, and HTTP status mapping.

`src/app/api/landing-rankings/`
: Additive market-terminal selection endpoint. It does not rank wrappers for execution and does not alter firewall semantics.

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

These are quote observations only. Binance aggregator use is quote-only; Underly exposes no swap/execute path.

## v0.2 additive data flow

```text
Binance Web3 RWA universe
        |
        +--> company / fundamentals / reference evidence
        +--> market history
        +--> standardized liquidity observations
        +--> current ActionGuard / dividend snapshot
        +--> landing Hot / mover candidate evidence
        |
        +--> wallet contract allow-set
                 |
public address -> EVM JSON-RPC balanceOf snapshot

Alpha Vantage (optional)
        |
        +--> contextual news
        +--> historical dividends / splits
```

## Company / reference evidence flow

Per wrapper:

```text
Underlying Market referencePrice
        |
        +-- available --> use as wrapper reference
        |
        +-- missing --> fallback to RWA Price referencePrice
```

The wrapper retains provenance:

```text
UNDERLYING_MARKET
RWA_PRICE
```

Cross-provider ordinary fundamentals still resolve through `CONSENSUS / SINGLE_SOURCE / CONFLICT / UNKNOWN`.

The stock-detail hero uses a separate deterministic headline-reference selector:

```text
prefer UNDERLYING_MARKET
fallback RWA_PRICE
deterministic provider tie-break
=> SINGLE SOURCE
```

This avoids treating small source/timing differences as a hero-level error while preserving both provider values in wrapper evidence.

## Landing ranking flow

```text
token universe
    |
    +--> Hot: bounded sort using token-list volume24H
    |
    +--> Gainers / Losers (lazy)
            |
            +--> primary wrapper candidate discovery
            +--> strongest candidates only
            +--> second-wrapper verification
            +--> direction + spread / reference guard
            +--> bounded response
```

The route is designed to control latency and upstream request volume. It does not claim that a wrapper with the best current quote snapshot is permanently superior.

## Evidence separation

- current ActionGuard != historical corporate-action timeline
- failed wallet read != zero balance
- missing chart sample != zero
- formatting difference != provider conflict
- genuine numeric provider difference == explicit conflict
- wrapper reference fallback != cross-provider consensus
- headline selected reference != hidden provider evidence
- current ratio semantics != historical ratio continuity
- quote observation != trade execution
- provider metadata != Underly-generated fact
- missing attestation metadata != PASS

## Liquidity observation

Standardized liquidity uses an immediate quote round trip:

```text
benchmark USDT
  -> wrapper quote
  -> exact quoted wrapper output
  -> reverse quote to USDT
```

Round-trip friction is calculated from benchmark vs recovered quote value. Route metadata such as reported price impact, raw gas estimate, or provider fee metadata is not naively summed to fabricate the result.

## Historical chart safety

Current token/share-ratio direction is verified, but historical continuity is not. v0.2 therefore keeps raw and indexed-100 historical modes only. Historical share-adjusted charts remain deferred.

## Failure semantics

Underly prefers explicit partial/unknown states over false certainty.

Examples:

- a missing reference remains unavailable unless a verified fallback endpoint supplies it
- missing attestation fields keep wrapper integrity `UNKNOWN`
- provider news/history errors are sanitized but not converted into fabricated evidence
- wrapper-source disagreement is preserved
- optional enrichment can be absent without changing read-only core behavior
