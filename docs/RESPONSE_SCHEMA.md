# `/api/firewall/check` response contract — v0.1

Status: FROZEN

## Top-level contract

The response contains exactly:

- `version`
- `requestId`
- `checkedAt`
- `request`
- `methodology`
- `underlying`
- `wrappers`
- `proof`

## Request

Normalized request contains:

- `ticker`
- `contractAddress`
- `intent`
- `amountUsd`
- `tokenAmount`
- `amountMeaning`
- `positionInput`
- `platform`
- `chainId`

## Wrapper contract

Each `wrappers[]` item contains exactly:

- `identity`
- `passport`
- `market`
- `integrity`
- `execution`
- `valuation`
- `corporateActions`
- `findings`
- `sources`

## Execution

`execution` contains exactly:

- `benchmarkNotionalUsd`
- `methodology`
- `quantitySource`
- `tokenAmount`
- `entry`
- `exit`
- `breakdown`
- `executableValueUsd`
- `currentHaircutUsd`
- `currentHaircutPct`
- `favorableQuotedDeltaUsd`
- `quoteTimestamp`

### methodology

One of:

- `CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE`
- `CURRENT_DIRECT_EXIT_QUOTE`
- `CURRENT_LIQUIDATION_VALUE`
- `NOT_APPLICABLE`

Intent mapping:

- BUY → `CURRENT_ENTRY_EXIT_LIQUIDITY_PROBE`
- HOLD → `NOT_APPLICABLE`
- SELL → `CURRENT_DIRECT_EXIT_QUOTE`
- COLLATERAL → `CURRENT_LIQUIDATION_VALUE`

### quantitySource

One of:

- `SYNTHETIC_ENTRY_OUTPUT`
- `DERIVED_FROM_TOKEN_PRICE`
- `USER_SUPPLIED`
- `null`

### tokenAmount

Token quantity associated with the analysis.

Its provenance is defined by `quantitySource`.

For exact SELL/COLLATERAL token input:

- `quantitySource = USER_SUPPLIED`
- `tokenAmount` preserves the supplied quantity

### breakdown

Contains:

- `entry`
- `exit`
- `roundTrip`

Applicable execution leg fields:

- `benchmark`
- `benchmarkValueUsd`
- `quotedValueUsd`
- `frictionUsd`
- `frictionPct`
- `favorableQuotedDeltaUsd`

BUY may populate entry, exit, and roundTrip.

SELL/COLLATERAL direct execution may populate exit only.

HOLD without execution leaves all three null.

## Valuation

`valuation` is an object or `null`.

When available:

- `displayedValueUsd`
- `referenceAdjustedValueUsd`
- `executableValueUsd`
- `conservativeValueUsd`
- `basis`

HOLD without position size:

`valuation = null`

## ActionGuard

`corporateActions.status`:

- `CLEAR`
- `ACTIVE`
- `UNKNOWN`

Rules:

- explicit corporate-action evidence → `ACTIVE`
- ordinary known session restriction without corporate-action evidence → `CLEAR`
- unclassified restriction → `UNKNOWN`
- unavailable status information → `UNKNOWN`

Missing data is never silently interpreted as PASS.

## Proof

Contains exactly:

- `proofId`
- `schemaVersion`
- `generatedAt`
- `dataHash`

Proof schema:

`underly-proof-v1`

`dataHash` is SHA-256 over the response payload before the proof block is attached.

## Null and decimal semantics

Financial decimal values are JSON strings where applicable.

Missing information remains explicit using:

- `null`
- `UNKNOWN`
- unavailable route state
- deterministic findings

Missing data != PASS.
