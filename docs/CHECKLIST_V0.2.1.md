# Underly v0.2.1 Checklist Addendum

This file records the historical-market milestone without replacing the authoritative `docs/CHECKLIST.md`.

## Wrapper Universe

- [x] Provider-agnostic `/api/universe`
- [x] Live chain 56 validation
- [x] 448 underlying discovered in validation snapshot
- [x] 488 wrappers discovered
- [x] 2 live providers discovered: bstock, ondo
- [x] Multi-wrapper underlying discovery confirmed

The counts above are a dated live snapshot, not permanent product constants.

## Historical Market Data

- [x] Binance Web3 generic candle adapter
- [x] Provider-agnostic wrapper history requests
- [x] NVDA Ondo history live-validated
- [x] NVDA bStocks history live-validated
- [x] Per-wrapper coverage metadata
- [x] Timestamp-based chart alignment
- [x] Missing candle => null, never zero
- [x] Raw close-price comparison
- [x] Indexed-100 comparison with common baseline
- [x] Fail closed if every wrapper history is unavailable
- [ ] Validate useful interval coverage (`1m`, `5m`, `1h`, `1d`)
- [ ] Validate production acceptance of `limit > 100`
- [ ] Validate deeper history windows
- [ ] Validate candle volume/trade-count semantics before comparing providers
- [ ] Verify non-1 token/share-ratio direction
- [ ] Add share-adjusted chart mode only after ratio verification
- [ ] Historical underlying/reference baseline source

## Next core milestone

After the remaining history coverage checks:

**Company Profile & Fundamentals**

Target data includes description, industry/sector, website, market cap, 52-week range, volume/average volume, P/E, P/B, dividend yield and latest dividend metadata where authoritative sources support them.
