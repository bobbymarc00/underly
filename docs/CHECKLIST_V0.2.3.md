# Underly v0.2.3 Checklist Addendum

## Company / Fundamentals live validation

- [x] NVDA both wrappers profile source AVAILABLE
- [x] NVDA both wrappers market source AVAILABLE
- [x] CEO consensus
- [x] website consensus
- [x] industry consensus
- [x] description UNKNOWN preserved
- [x] provider fundamental conflicts preserved
- [x] latest dividend consensus observed
- [ ] Validate second ordinary company ticker
- [ ] Validate ETF/non-company ticker

## Wrapper Liquidity Intelligence

- [ ] Apply `/api/liquidity`
- [ ] Regression suite passes
- [ ] Production build passes
- [ ] Live NVDA standardized probe
- [ ] Confirm both wrappers retain independent vendors/routes
- [ ] Confirm round-trip recovery on same benchmark
- [ ] Validate behavior during non-trading session
- [ ] Validate an insufficient-liquidity ticker/size
- [ ] Validate `volume24H` meaning before cross-provider comparison
- [ ] Freeze liquidity response only after live evidence review

## Product rule

No "best wrapper" ranking is part of this milestone.

The eventual UI may compare factual liquidity evidence side by side, but it must not invent a score or threshold outside backend deterministic logic.

## Next planned milestone

After liquidity validation:

**Dividends & Corporate Actions event model**

Then:

- current related news provider abstraction
- read-only wallet inspector
- final stock-terminal UI after backend contracts stabilize
