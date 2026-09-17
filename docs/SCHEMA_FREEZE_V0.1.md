# UNDERLY `/api/firewall/check` — Schema Freeze v0.1

Status: FROZEN

Freeze date: 2026-09-17

Endpoint:

`POST /api/firewall/check`

Response schema version:

`0.1`

Application package version:

`0.1.0`

Proof schema:

`underly-proof-v1`

## Request contract

Exactly one of:

- `ticker`
- `contractAddress`

Intent:

- `BUY`
- `HOLD`
- `SELL`
- `COLLATERAL`

BUY:

- `amountUsd` required
- `tokenAmount` rejected

HOLD:

- size optional
- no synthetic execution

SELL:

- exactly one of `amountUsd` or `tokenAmount`

COLLATERAL:

- exactly one of `amountUsd` or `tokenAmount`

## Exact quantity semantics

SELL/COLLATERAL with `tokenAmount`:

- `request.amountMeaning = TOKEN_QUANTITY`
- `request.positionInput = TOKEN_AMOUNT`
- `execution.quantitySource = USER_SUPPLIED`
- `execution.tokenAmount` preserves supplied quantity

BUY:

- `execution.quantitySource = SYNTHETIC_ENTRY_OUTPUT`

USD-notional SELL/COLLATERAL:

- `execution.quantitySource = DERIVED_FROM_TOKEN_PRICE` when quantity can be derived

## HOLD without size

- `request.amountMeaning = NONE`
- `request.positionInput = NONE`
- `execution.methodology = NOT_APPLICABLE`
- no quote attempted
- execution breakdown empty
- `valuation = null`

## Frozen top-level fields

- `version`
- `requestId`
- `checkedAt`
- `request`
- `methodology`
- `underlying`
- `wrappers`
- `proof`

## Frozen wrapper fields

- `identity`
- `passport`
- `market`
- `integrity`
- `execution`
- `valuation`
- `corporateActions`
- `findings`
- `sources`

`execution.breakdown` lives inside `execution`.

## Frozen execution names

v0.1 uses:

- `benchmarkNotionalUsd`
- `tokenAmount`

Pre-freeze names not part of v0.1:

- `requestedNotionalUsd`
- `derivedTokenAmount`

## ActionGuard

States:

- `CLEAR`
- `ACTIVE`
- `UNKNOWN`

Missing data is not PASS.

## Compatibility

v0.1 retains:

- `executableValueUsd`
- `currentHaircutUsd`
- `currentHaircutPct`
- `favorableQuotedDeltaUsd`

`execution.breakdown` is authoritative for detailed execution friction.

## Freeze validation

Accepted after:

- Schema freeze was established with the firewall contract regression suite passing.
- Current post-freeze regression baseline: 7 test files / 39 tests passing.
- response-contract regression tests passed
- stale pre-freeze execution field names removed
- TypeScript production build passed
- Next.js production build passed

## Change policy

Existing v0.1 field names, nesting, intent semantics, null semantics, execution semantics, and ActionGuard semantics must not change silently.

Breaking changes require a version/schema bump.

Backward-compatible additions must still be deliberate, documented, and regression-tested.

Missing evidence must never be converted into PASS for compatibility.
