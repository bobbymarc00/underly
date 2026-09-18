# Underly — Final Market Terminal / Evidence Pass

Date: **2026-09-19**

Base before local freeze:

```text
a487ae1 feat: complete Underly market terminal UI
```

## Highlights

### Market landing

- added Hot / Gainers / Losers terminal views
- Hot uses bounded token-list volume evidence
- mover views are lazy-loaded
- added bounded two-stage wrapper verification
- added cross-wrapper direction/spread checks
- added guarded single-source fallback
- avoided permanent wrapper ranking claims

### Stock reference evidence

- added bStocks reference fallback from dedicated RWA Price when Underlying Market omits reference
- preserved per-wrapper source provenance
- separated headline reference selection from cross-provider fundamental resolution
- headline now chooses one deterministic canonical source and displays `SINGLE SOURCE`
- wrapper-level disagreement remains visible

### Fundamental evidence

- added numeric canonicalization to prevent formatting-only false conflicts
- preserved genuine market-cap / P/E / P/B disagreement as `CONFLICT`
- added dividend-yield provider-convention normalization while retaining raw provider evidence

### HOLD proof

- preserved fail-closed `UNKNOWN` behavior when attestation metadata is missing
- changed generic wrapper-incomplete finding to explicit missing-field diagnostics
- reference availability no longer gets confused with missing attestation evidence

### Liquidity

- retained quote-recovery-based round-trip friction
- verified that wrapper decimals do not contaminate immediate reverse-quote math
- did not rewrite core liquidity logic based on one transient outlier

### News / historical evidence

- sanitized public provider errors
- retained shared news-cache behavior
- improved generic unavailable-state presentation
- retained strict separation between current ActionGuard and historical corporate actions

### UI

- completed terminal surface/color consistency pass
- improved stock wrapper evidence layout
- added reference provenance
- retained read-only, evidence-first messaging

## Validation

Latest completed validation before final docs:

```text
18/18 targeted tests PASS
214/214 full suite PASS
Next.js production build PASS
TypeScript PASS
git diff --check PASS
```

## Security boundary

No execution capability was added.

Still prohibited by design:

```text
trade / swap execution
token approval
transaction signing
transaction broadcast
private key / seed phrase handling
```

## Deferred

- historical share-adjusted chart
- historical ratio continuity assumptions
- additional unsupported corporate-action event families
- write/execution features
