# Underly Build Checklist

## Foundation
- [x] Windows + VS Code development
- [x] Next.js + TypeScript
- [x] Server-only Binance credentials
- [x] Production build
- [x] Vitest
- [x] Bounded Binance 42900 retry with fresh signatures

## Core data
- [x] RWA discovery
- [x] Wrapper identity
- [x] RWA token/reference price
- [x] Underlying market/session
- [x] Underlying profile
- [x] Attestation metadata
- [x] Aggregator quote

## Underly engine
- [x] Asset Passport
- [x] Wrapper Integrity
- [x] Reference divergence
- [x] Conservative valuation
- [x] Deterministic findings
- [x] Source provenance
- [x] SHA-256 proof
- [x] Finding dedupe

## Intent engine
- [x] BUY: current entry + full reverse liquidity probe
- [x] HOLD: no synthetic execution probe
- [x] SELL: direct current exit quote from position notional
- [x] COLLATERAL: current liquidation-value quote from position notional
- [x] Intent-aware execution findings
- [x] `tradingAvailable` session naming
- [x] Intent-specific execution methodology labels

## Live validation
- [x] NVDA / multiple wrappers
- [x] TEL / execution friction
- [x] VZ / reference divergence
- [x] AOSL / non-trading session
- [x] AXTI / wrapper differences
- [ ] BUY intent regression matrix after intent patch
- [ ] HOLD intent live validation
- [ ] SELL intent live validation
- [ ] COLLATERAL intent live validation

## Next modules
- [ ] Corporate-action signals
- [ ] Corporate-action halt/event interpretation
- [ ] Collateral policy layer beyond conservative mark
- [ ] Response schema freeze
- [ ] Production/Vercel evidence

## UI
- [x] Minimal functional debug UI
- [ ] Final polished UI — intentionally LAST

## Phase 4.5 — Execution Explainability
- [x] Explicit BUY entry benchmark
- [x] Explicit BUY exit benchmark
- [x] Explicit BUY round-trip benchmark
- [x] Direct SELL/COLLATERAL exit breakdown
- [x] Favorable delta separated from friction
- [x] Legacy haircut fields preserved for compatibility
- [ ] Live verification on NVDA wrappers
