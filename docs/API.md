# Underly API v0.1

UNDERLY — Know what you really hold.

## `GET /api/search?q=NVDA`

Returns tokenized-equity search results and matching BSC wrappers.

## `POST /api/firewall/check`

Analyzes one underlying/wrapper set using the frozen Underly v0.1 contract.

### Request

Exactly one of:

- `ticker`
- `contractAddress`

is required.

Supported intents:

- `BUY`
- `HOLD`
- `SELL`
- `COLLATERAL`

Optional:

- `platform`: `ondo` or `bstock`

Financial inputs are positive decimal strings.

### BUY

`amountUsd` is required.

`tokenAmount` is not accepted.

Example:

```json
{
  "ticker": "NVDA",
  "intent": "BUY",
  "amountUsd": "1000"
}
```

Execution methodology:

- current entry quote
- full reverse liquidity probe
- entry friction
- exit friction
- round-trip friction

`quantitySource = SYNTHETIC_ENTRY_OUTPUT`

### HOLD

Position size is optional.

Example:

```json
{
  "ticker": "NVDA",
  "intent": "HOLD"
}
```

No synthetic execution is performed.

Without position size:

- `request.amountMeaning = NONE`
- `request.positionInput = NONE`
- `execution.methodology = NOT_APPLICABLE`
- `valuation = null`

HOLD may optionally use one of:

- `amountUsd`
- `tokenAmount`

### SELL

Exactly one of `amountUsd` or `tokenAmount` is required.

Exact quantity example:

```json
{
  "ticker": "NVDA",
  "intent": "SELL",
  "tokenAmount": "4.5"
}
```

With `tokenAmount`:

- `request.amountMeaning = TOKEN_QUANTITY`
- `request.positionInput = TOKEN_AMOUNT`
- `execution.quantitySource = USER_SUPPLIED`
- `execution.tokenAmount` preserves the supplied quantity
- execution uses a direct current exit quote

With `amountUsd`, token quantity is derived from the current token price when available.

### COLLATERAL

Exactly one of `amountUsd` or `tokenAmount` is required.

Example:

```json
{
  "ticker": "NVDA",
  "intent": "COLLATERAL",
  "tokenAmount": "4.5"
}
```

COLLATERAL uses current direct liquidation-value analysis.

Exact `tokenAmount` uses:

- `execution.quantitySource = USER_SUPPLIED`
- the exact supplied token quantity
- conservative valuation when sufficient valuation inputs are available

## Response

Frozen v0.1 top-level fields:

- `version`
- `requestId`
- `checkedAt`
- `request`
- `methodology`
- `underlying`
- `wrappers`
- `proof`

Each `wrappers[]` item contains:

- `identity`
- `passport`
- `market`
- `integrity`
- `execution`
- `valuation`
- `corporateActions`
- `findings`
- `sources`

Execution friction detail lives at:

`wrappers[].execution.breakdown`

with:

- `entry`
- `exit`
- `roundTrip`

## ActionGuard

`corporateActions.status` is one of:

- `CLEAR`
- `ACTIVE`
- `UNKNOWN`

Rules:

- explicit corporate-action evidence can produce `ACTIVE`
- ordinary market/session restrictions do not by themselves imply a corporate action
- unclassified restriction produces `UNKNOWN`
- unavailable status information produces `UNKNOWN`

Missing evidence is never silently treated as PASS/CLEAR.

## Financial representation

Financial decimal values are serialized as JSON strings where applicable.

Unknown or unavailable information remains explicit with `null`, `UNKNOWN`, unavailable route state, or deterministic findings.

Missing data is not treated as PASS.

## Execution compatibility fields

`execution.breakdown` is the authoritative detailed execution-friction representation.

The following v0.1 compatibility fields remain available:

- `executableValueUsd`
- `currentHaircutUsd`
- `currentHaircutPct`
- `favorableQuotedDeltaUsd`

## Errors

The endpoint may return:

- `400` — invalid JSON or request
- `404` — underlying/wrapper not found
- `502` — Binance Web3 upstream failure
- `503` — other Underly check failure

## Versioning

API response schema:

`0.1`

Application package:

`0.1.0`

Proof format:

`underly-proof-v1`

Breaking response-contract changes require an explicit schema/version bump rather than silently changing v0.1.
