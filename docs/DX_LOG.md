# Developer Experience Log

Keep this file chronological and evidence-based. Do not rewrite it at submission time from memory.

## Observations already worth reproducing

- Binance request signatures require `/build` in the signed request path.
- RWA platform discovery observed Ondo and bStocks on BSC; xStocks was not present in the tested platform enumeration.
- Provider metadata completeness differs: some bStocks underlying-market / attestation fields were null while price endpoints still returned references.
- RWA Price may return business code `42900` while other RWA/quote endpoints still succeed; Underly uses bounded retry with a fresh timestamp/signature per retry and preserves UNKNOWN if retries are exhausted.
- `Search RWA Token` identifies wrappers but the documented search response does not include token decimals. Direct SELL/COLLATERAL quote construction therefore enriches search results from `Get RWA Token List`, which does expose `decimals`.
- Aggregator error `40374`: insufficient liquidity for a quote.
- Aggregator error `40367`: token currently in a non-trading session.
- Quote availability can be non-monotonic across size / RFQ snapshots.
- Same underlying can have materially different wrapper execution conditions.
- Token/reference divergence and execution friction are separate risk dimensions.

For every new observation record: UTC timestamp, endpoint, request class, response code/message, expected behavior, actual behavior, workaround, and product impact.

## Vercel production validation — 2026-09-17

- Initial Vercel Node.js Function execution in `iad1` received Binance Web3 business code `40304`: `Service not available due to compliance restriction`.
- Moving the project Function Region to `sin1` produced successful RWA responses; `/api/search?q=NVDA` returned both NVDAon and NVDAB wrappers.
- Production smoke passed BUY, HOLD, exact-quantity SELL, and exact-quantity COLLATERAL semantics.
- Direct `contractAddress` resolution and `platform=bstock` filtering passed.
- AOSL produced `NON_TRADING_SESSION` while ActionGuard remained `CLEAR`, confirming ordinary session restriction is not mislabeled as a corporate action.
- VZ produced `REFERENCE_DIVERGENCE`.
- Production Underly Proof `dataHash` and `proofId` were independently recomputed and matched.
- TEL did not cross the execution-friction threshold in the latest production snapshot; execution findings are intentionally based on current liquidity rather than historical labels.
