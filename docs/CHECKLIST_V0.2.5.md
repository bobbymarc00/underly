# Underly v0.2.5 Checklist Addendum

## Dividend-yield convention

- [x] Multi-ticker overlap diagnostic completed
- [x] NVDA factor-100 pattern observed
- [x] AVGO factor-100 pattern observed
- [x] MU factor-100 pattern observed
- [x] IBM/MSFT/QCOM support the same unit-family interpretation with small source-value differences
- [x] TSM missing-yield evidence preserved
- [x] INTC zero-yield evidence preserved
- [x] Ondo current convention documented as percentage points
- [x] bStocks current convention documented as unit fraction
- [ ] Apply normalization helper
- [ ] Verify NVDA normalized yield becomes 0.13% for both wrappers
- [ ] Preserve raw values in API
- [ ] Unknown future provider remains unnormalized

## Related News

- [ ] Apply provider abstraction
- [ ] Regression suite passes
- [ ] Production build passes
- [ ] Add `UNDERLY_NEWS_PROVIDER` optional config
- [ ] Add first Alpha Vantage adapter
- [ ] Configure a server-only Alpha Vantage API key for live validation
- [ ] Live NVDA latest-news smoke
- [ ] Verify latest-first ordering
- [ ] Verify source + publish time + outbound URL
- [ ] Do not generate missing articles

## Historical corporate actions opportunity

Alpha Vantage currently documents:

- `DIVIDENDS`
- `SPLITS`

After news validation, evaluate those endpoints as an independent historical-event source for Underly's corporate-action timeline.

## Next

After current news is live-validated:

1. Historical dividend/split adapter
2. Read-only wallet inspector
3. v0.2 contract audit/freeze
4. Final stock-terminal UI
