# Underly v0.1 Product Spec

**Tagline:** Know what you really hold.

Underly is a zero-install, read-only tokenized-equity inspection layer. A user provides a ticker or contract, an intent (`BUY`, `HOLD`, `SELL`, `COLLATERAL`) and a USD notional. Underly resolves available BSC wrappers and returns identity, wrapper metadata, token/reference pricing, market/session state, current executable quote conditions, conservative valuation, deterministic findings and a timestamped proof hash.

## MVP principles

- Missing data is never treated as PASS.
- Financial decimal values are transported as strings.
- No private keys, wallet signing, approvals or transaction broadcasts in v0.1.
- No black-box safety score.
- Findings are deterministic and evidence-backed.
- Reverse quotes measure **current execution friction**, not expected investment return.

## Included in v0.1

1. Dynamic RWA search / wrapper discovery.
2. Asset Passport: provider, token/share ratio, attestation metadata.
3. Reference layer: token price, underlying reference, divergence, market session.
4. EXIT0-derived execution intelligence: entry availability, synthetic full reverse exit, executable value/haircut.
5. Conservative valuation: minimum of displayed, reference-adjusted and executable value when available.
6. Deterministic findings.
7. Source provenance and Underly Proof hash.
8. Public read-only API and debug web UI.

## Deferred

- Wallet holdings scan and real sell sizing.
- Real swap execution.
- Full legal-rights database.
- Corporate-action reconciliation.
- On-chain proof anchoring.
- Agent Studio / x402.
