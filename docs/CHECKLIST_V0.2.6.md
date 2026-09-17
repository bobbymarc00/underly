# Underly v0.2.6 Historical Corporate Actions Checklist

## Contract

- [x] Dedicated `/api/corporate-actions/history` route
- [x] Provider-neutral `DIVIDEND` / `STOCK_SPLIT` event schema
- [x] Current `/api/corporate-actions` ActionGuard remains separate
- [x] No historical event inferred from current Binance status fields
- [x] No currency or split ratio invented
- [x] Missing/malformed event anchors rejected, not guessed
- [x] Future declared dividend rows excluded from historical events
- [x] Rejected raw rows preserved as evidence
- [x] Complete snapshots cacheable; partial snapshots retry
- [x] Existing v0.2.5.2 news cache untouched

## Validation

- [x] Adapter tests included
- [x] Route tests included
- [x] Current corporate-actions regression assertion updated
- [x] PowerShell live smoke included
- [ ] Run `npm test` on local repo after apply
- [ ] Run `npm run build` on local repo after apply
- [ ] Run live NVDA smoke with configured `ALPHAVANTAGE_API_KEY`

## Next milestone

1. Read-only wallet inspector
2. v0.2 audit/freeze
3. Final stock-exchange UI
