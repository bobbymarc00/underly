# Underly v0.8-A — Exposure Intelligence

Status: implemented, additive to the v0.7 Unified Portfolio response.

## Scope

v0.8-A derives deterministic current-snapshot exposure intelligence from the
already validated Unified Portfolio positions. The exposure engine performs no
network requests and does not change the single-block wallet balance snapshot.

The existing v0.7 response fields remain present. `GET /api/portfolio` adds:

```text
exposures
  denominator
  coverage
  reconciliation
  byUnderlying
  byWrapper
  byProvider
```

This work does not add historical monitoring, cost basis, P&L, dividend
entitlement, quoting, transaction construction, simulation, signing, approval,
broadcast, or execution capability.

## Empty-universe boundary

A successful provider envelope with no validated BSC wrappers does not prove an
empty wallet.

```text
empty/unverifiable wrapper universe
  -> HTTP 502
  -> portfolio status UNAVAILABLE
  -> error RWA_UNIVERSE_EMPTY
  -> no Multicall balance request
  -> no price, market, or profile request
```

This is intentionally distinct from:

```text
validated non-empty wrapper universe
  + every balanceOf succeeds at the same block
  + every balance is zero
  -> HTTP 200
  -> portfolio status AVAILABLE
  -> provenZeroBalanceCount > 0
  -> no positive exposure groups
```

An empty array of balance evidence is also fail-closed as `UNAVAILABLE` in the
portfolio core.

## Identity rules

### Underlying

Positions are combined only when they carry the same source-backed underlying
identity and the identity evidence status is `AVAILABLE`. A missing or unknown
identity is excluded from `byUnderlying`, but the position remains visible in
the exact-wrapper and provider breakdowns.

### Wrapper

Wrapper identity is:

```text
chainId + normalized contract address
```

Symbol equality is not identity evidence. Duplicate chain-contract positions
are counted once and are reported through `coverage.duplicatePositionCount`.

### Provider

Provider groups use the provider identity carried by the source position. The
provider label is not treated as issuer identity, legal-rights evidence, or a
safety ranking.

## Known-value denominator

Only a position with:

```text
valuation.status = AVAILABLE
indicativeValueUsd = valid non-negative decimal string
```

contributes to the known-value denominator.

```text
knownValueWeightPct =
  group known indicative value
  / portfolio known indicative value
  * 100
```

The denominator is included on every group as
`weightDenominator`. Positions without valuation evidence are not converted to
zero. They are counted in `unknownValuePositionCount` and make the relevant
valuation coverage `PARTIAL` or `UNAVAILABLE`.

If the known-value denominator is zero:

```text
denominator.status = UNAVAILABLE
knownValueWeightPct = null
```

It is never displayed as `0%` allocation.

`valuationCoveragePct` is count-based evidence coverage:

```text
known-valued position count / total position count * 100
```

It does not estimate the value of excluded positions.

## Share-equivalence boundary

Underlying-equivalent shares are summed only inside one verified underlying
group. Shares from different tickers are never summed into provider or portfolio
share totals.

If any position in an underlying group lacks current equivalence evidence:

- `underlyingEquivalentShares` is `null`
- `knownUnderlyingEquivalentShares` retains the sourced subtotal
- `unknownSharePositionCount` reports the excluded positions
- `equivalenceStatus` is `PARTIAL` or `UNAVAILABLE`

No current ratio is projected into historical data.

## Example

Given three known-valued positions worth `$10`, `$30`, and `$60`, where the
first two wrappers represent NVDA and the third represents AMD:

```json
{
  "denominator": {
    "basis": "PORTFOLIO_KNOWN_INDICATIVE_VALUE_USD",
    "knownIndicativeValueUsd": "100",
    "knownValuePositionCount": 3,
    "unknownValuePositionCount": 0,
    "status": "AVAILABLE"
  },
  "byUnderlying": [
    {
      "identity": "BINANCE_RWA:56:AMD",
      "knownIndicativeValueUsd": "60",
      "knownValueWeightPct": "60"
    },
    {
      "identity": "BINANCE_RWA:56:NVDA",
      "knownIndicativeValueUsd": "40",
      "knownValueWeightPct": "40"
    }
  ]
}
```

If one of the NVDA positions has unknown valuation, its value is excluded, the
weight remains explicitly a share of known value only, and coverage reports the
excluded position.

## Compatibility and safety

- Frozen v0.1 and v0.2 contracts are unchanged.
- Existing v0.7 portfolio fields remain available.
- The browser boundary continues to accept a valid legacy v0.7 portfolio
  envelope and requires valid exposure intelligence for v0.8 responses.
- Exposure calculation adds no provider or RPC request.
- Failed/unknown balance evidence is never converted to zero.
- Execution capability remains unavailable.
- Continuity remains an explicit user-triggered handoff.

## Validation commands

```powershell
npx vitest run tests/portfolio-intelligence.test.ts tests/portfolio.test.ts tests/portfolio-source.test.ts tests/portfolio-route.test.ts tests/portfolio-ui.test.ts tests/v02-freeze-boundary.test.ts tests/execution-readiness-boundary.test.ts
npm test
npx tsc --noEmit --incremental false
npm run build
npx eslint src/lib/underly/portfolio-intelligence.ts src/lib/underly/portfolio.ts src/lib/portfolio/source.ts src/app/api/portfolio/route.ts src/lib/ui/market-types.ts src/lib/ui/portfolio.ts src/components/market/WalletTerminal.tsx tests/portfolio-intelligence.test.ts tests/portfolio.test.ts tests/portfolio-source.test.ts tests/portfolio-route.test.ts tests/portfolio-ui.test.ts
git diff --check
```
