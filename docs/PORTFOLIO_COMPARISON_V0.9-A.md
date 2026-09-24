# Portfolio Snapshot Comparison v0.9-A

## Scope

v0.9-A compares two separately captured Unified Portfolio responses for one
public BSC address. It is a read-only observation tool, not a historical ledger.
The browser keeps Snapshot A, Snapshot B, and the result in React session memory
only. Reloading or closing the page discards them.

No database, local storage, background polling, wallet connection, signature,
approval, transaction construction, simulation, broadcast, or automatic quote is
introduced.

## Capture contract

Both inputs must be actual, runtime-valid `GET /api/portfolio` responses. The
comparison validator requires internally consistent:

- normalized wallet address and BSC chain identity;
- numeric block tag and block number;
- same-block balance checks and positive-position evidence;
- universe/check/position/exposure counts;
- portfolio, universe, snapshot, valuation, and read-only status fields;
- unique exact wrapper identities.

The two inputs must have the same wallet address and chain. The comparison route
accepts client-supplied responses, so its provenance is explicitly
`CLIENT_SUPPLIED_PORTFOLIO_RESPONSES`. Runtime validation does not turn those
responses into an independently or cryptographically verified archive.

## Identity rules

A position is identified only by:

```text
exact chain ID + normalized wrapper contract address
```

Ticker similarity never merges wrappers. Underlying aggregation uses the
verified v0.8 underlying identity. If decimals, wrapper metadata, provider, or
underlying identity conflicts, the affected dimension is blocked instead of
choosing one snapshot silently.

## Comparison semantics

For mutually evidenced balances the engine reports:

- raw balance and exact token quantity at A and B;
- signed and absolute token-quantity difference;
- underlying-equivalent shares and share difference when equivalence identity is
  compatible;
- token/share ratio from each capture and its observed difference;
- token price and indicative value from each capture and their observed
  differences when both sides are available.

All financial arithmetic uses Decimal. Snapshot B ratio or price is never applied
retroactively to Snapshot A.

Balance observations are classified separately:

- proven zero at A and positive at B: `APPEARED`;
- positive at A and proven zero at B: `DISAPPEARED`;
- positive at both: `CHANGED` or `UNCHANGED` from exact raw balance;
- unreadable balance on either side: `UNAVAILABLE`, never zero;
- absent wrapper coverage on either side: `COVERAGE_GAP`, never disappearance;
- incompatible metadata: `METADATA_CONFLICT`;
- contradictory same-block evidence: `EVIDENCE_CONFLICT`.

An observed data difference can be a balance, ratio, share, price, or indicative
value difference. It is not automatically an on-chain wallet change. Price and
provider metadata may update asynchronously from the wallet balance block.

## Value and coverage

The comparable indicative-value subtotal includes only exact wrapper positions
whose value is available on both sides. Its delta is B minus A. Positions lacking
valuation on either side are excluded and counted explicitly.

The original known indicative total and valuation coverage for each snapshot are
also retained separately. Underly does not subtract two portfolio totals with
different coverage and present that result as a portfolio-wide value change.

A partial input, unknown balance, coverage gap, metadata conflict, incomplete
integrity evidence, invalid ordering, or otherwise incomplete scope prevents a
claim that the entire wallet comparison is complete.

## Time and ordering

Both snapshot summaries preserve:

- `blockNumber` and `blockTag`;
- `generatedAt`;
- block timestamp value and availability status;
- portfolio/universe status and valuation coverage.

If both wallet reads use the same block, the result is
`SAME_BLOCK_NO_ONCHAIN_INTERVAL`. Arithmetic differences may still be displayed,
but no between-block on-chain event is claimed. Reversed block/capture ordering is
reported as invalid. An unavailable block timestamp remains `UNKNOWN`.

These captures are not synchronized historical market valuations because wrapper
prices and ratios are provider observations made during each request.

## Interpretation boundary

The result never labels a balance difference as BUY, SELL, transfer, dividend, or
user action without transaction evidence. Indicative-value differences are not
realized or unrealized P&L, return, cost basis, market performance, or dividend
entitlement.

## API and UI

`POST /api/portfolio/compare` accepts:

```json
{
  "snapshotA": { "...": "validated /api/portfolio response" },
  "snapshotB": { "...": "validated /api/portfolio response" }
}
```

The route performs validation and deterministic comparison only. It does not call
RPCs, providers, or execution services.

The `/wallet` panel exposes three explicit actions: Capture Snapshot A, Capture
Snapshot B, and Compare. Capturing uses only the currently displayed portfolio
response. Changing the wallet clears the pair and result, aborts in-flight work,
and prevents stale responses from being paired with the new address.

## Deferred

- persistent or cryptographically anchored snapshot archives;
- scheduled/background monitoring;
- transaction-level cause attribution;
- synchronized historical price/ratio evidence;
- historical P&L, cost basis, return, or dividend entitlement.

## Local validation — 2026-09-23

- focused portfolio and safety regression: 68/68 PASS;
- full suite: 460/460 PASS;
- TypeScript: PASS;
- production build: PASS;
- scoped ESLint: PASS;
- frozen/safety regression: 8/8 PASS;
- `git diff --check`: PASS.

The live BSC smoke used a previously verified public positive-balance wallet and
two independently requested local portfolio responses. The observed block order
was forward, all 51 positive wrapper positions were mutually comparable, and the
result remained `PARTIAL` because the source integrity evidence was partial. No
transaction or execution method was invoked.
