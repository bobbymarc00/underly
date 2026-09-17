# Underly v0.2.2 Checklist Addendum

## Current ratio semantics

- [x] NVDA Ondo `tokenPrice / referencePrice ~= tokenShareRatio`
- [x] NVDA Ondo `tokenPrice / tokenShareRatio ~= referencePrice`
- [x] NVDA bStocks `tokenPrice / referencePrice ~= tokenShareRatio`
- [x] NVDA bStocks `tokenPrice / tokenShareRatio ~= referencePrice`
- [x] Current share-equivalent formula documented
- [ ] Historical ratio continuity validated
- [ ] Share-adjusted historical mode remains deferred until continuity/event history is available

## Company Profile & Fundamentals

- [ ] Apply `/api/company` implementation candidate
- [ ] Regression suite passes
- [ ] Production build passes
- [ ] Live NVDA profile validation
- [ ] Live NVDA fundamental validation
- [ ] Verify Ondo vs bStocks field agreement/conflicts
- [ ] Validate a second ordinary company ticker
- [ ] Validate an ETF ticker such as SPY or QQQ for UNKNOWN/non-company semantics
- [ ] Freeze field-resolution contract after live evidence review

## Next

After company/fundamentals validation:

1. Wrapper liquidity intelligence
2. Dividend / corporate-action event model
3. Related news provider abstraction
4. Read-only wallet inspector
5. Final stock-terminal UI after backend contracts stabilize
