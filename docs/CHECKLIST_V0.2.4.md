# Underly v0.2.4 Checklist Addendum

## Liquidity live validation

- [x] NVDA benchmark = 1000 USD
- [x] bStocks entry route AVAILABLE
- [x] bStocks reverse route AVAILABLE
- [x] Ondo entry route AVAILABLE
- [x] Ondo reverse route AVAILABLE
- [x] Both wrappers independently reported LiquidMesh
- [x] Round-trip recovery preserved as current snapshot
- [x] Favorable/negative upstream price impact preserved without coercion
- [ ] Validate multiple benchmark sizes
- [ ] Validate non-trading-session behavior
- [ ] Validate explicit insufficient-liquidity case
- [ ] Validate cross-provider reported volume semantics

## Dividends & Corporate Actions

- [ ] Apply `/api/corporate-actions`
- [ ] Regression suite passes
- [ ] Production build passes
- [ ] Live NVDA dividend snapshot
- [ ] Live NVDA ActionGuard reconciliation
- [ ] Live AOSL ordinary-session check remains non-corporate-action
- [ ] Capture a real ACTIVE corporate-action case if/when one is exposed
- [ ] Choose authoritative historical event source before implementing timeline
- [ ] Do not derive event dates from `latestDividend`

## Next planned milestone

After current corporate-action/dividend snapshot validation:

**Related News provider abstraction**

Then:

- read-only wallet inspector
- broader v0.2 freeze/audit
- final stock-terminal UI
