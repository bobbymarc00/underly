# Underly Blueprint

Underly is a read-only trust and execution-inspection layer for tokenized equities.

```text
User/API request
  ticker + intent + USD notional
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
Treats `amountUsd` as current position notional. It derives an approximate token quantity using the current token price and requests a direct token-to-USDT quote. The response explicitly reports `quantitySource=DERIVED_FROM_TOKEN_PRICE`.

### COLLATERAL
Uses the same direct liquidation mechanism as SELL but interprets the quote as current liquidation value for conservative valuation. Underly v0.1 does not recommend an LTV.

## Rules
- Missing data is UNKNOWN, never PASS.
- UI never contains risk logic.
- No transaction signing or broadcasting.
- Financial decimals remain strings in API transport.
- Findings are deterministic; no LLM decides severity.
- Final visual design happens only after core behavior is validated.

## Execution Explainability v0.2
BUY now exposes three separate measurements:
1. entry — requested notional vs current RWA-price-marked value of acquired tokens;
2. exit — marked value of acquired tokens vs current executable reverse-sell proceeds;
3. roundTrip — requested notional vs current reverse-sell recovery.

SELL and COLLATERAL expose a direct exit/liquidation breakdown against the requested position notional. HOLD performs no execution probe.
