# Underly Blueprint

Underly is a read-only trust and execution-inspection layer for tokenized equities.

```text
User/API request
  ticker/contract + intent + intent-specific size
          |
          v
Asset resolver
          |
          +--> wrapper identity
          +--> RWA price/reference
          +--> underlying market/session
          +--> profile/attestation
          +--> aggregator quote when intent requires it
          |
          v
Underly Core
  Passport
  Integrity
  Intent-aware execution
  Valuation
  Findings
          |
          v
Sources + Proof
          |
          v
/api/firewall/check
```

## Intent semantics

### BUY
Measures current entry availability and a full reverse quote as a present-time liquidity probe. It is not a prediction of the user's future investment return.

### HOLD
Does not manufacture a trade. It evaluates identity, wrapper data, reference conditions, session state, attestation and valuation from available non-execution data.

### SELL
Uses exact `tokenAmount` when supplied (`quantitySource=USER_SUPPLIED`). `amountUsd` remains a fallback that derives token quantity from the current token price (`quantitySource=DERIVED_FROM_TOKEN_PRICE`). SELL requests a direct token-to-USDT exit quote.

### COLLATERAL
Uses exact `tokenAmount` when supplied, or the same `amountUsd` fallback derivation used by SELL. The direct quote is interpreted as current liquidation value for conservative valuation. Underly v0.1 does not recommend an LTV.

## Rules
- Missing data is UNKNOWN, never PASS.
- UI never contains risk logic.
- No transaction signing or broadcasting.
- Financial decimals remain strings in API transport.
- Findings are deterministic; no LLM decides severity.
- Final visual design happens only after core behavior is validated.

## Execution Explainability — included in schema v0.1
BUY now exposes three separate measurements:
1. entry â€” requested notional vs current RWA-price-marked value of acquired tokens;
2. exit â€” marked value of acquired tokens vs current executable reverse-sell proceeds;
3. roundTrip â€” requested notional vs current reverse-sell recovery.

SELL and COLLATERAL expose a direct exit/liquidation breakdown against the requested position notional. HOLD performs no execution probe.
