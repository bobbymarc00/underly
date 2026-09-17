# Company Profile & Fundamentals v0.2

Status: LIVE-VALIDATED FOUNDATION — response field-resolution behavior remains additive until broader ticker coverage is reviewed.

## Live NVDA validation — 2026-09-17

Both NVDA wrappers returned profile and underlying-market responses:

```text
bstock / NVDAB  AVAILABLE
ondo   / NVDAon AVAILABLE
```

### Company fields

| Field | Resolution | Live result |
| --- | --- | --- |
| CEO | CONSENSUS | Jensen Huang |
| website | CONSENSUS | https://www.nvidia.com |
| industry | CONSENSUS | Technology |
| description | UNKNOWN | no value returned in this snapshot |

`UNKNOWN` description is preserved as missing evidence; it is not treated as an implementation failure or filled from general knowledge.

### Fundamental evidence behavior

The live snapshot demonstrated why provider evidence must remain separate.

`latestDividend` was CONSENSUS, while several fields such as 52-week range, market cap, P/E, P/B and dividend yield differed between the two wrapper-reported underlying-market sources.

Other fields were present from only one wrapper source in this snapshot.

Underly therefore keeps the field-resolution states:

- `CONSENSUS`
- `SINGLE_SOURCE`
- `CONFLICT`
- `UNKNOWN`

A `CONFLICT` is not automatically an error: provider feeds may differ in refresh time, calculation convention or source. Underly exposes the evidence rather than selecting a winner without a documented basis.

## Endpoint

```text
GET /api/company?ticker=NVDA
```

## UI consequence

The final stock-terminal UI can display:

- one resolved company profile where evidence agrees
- an explicit source-divergence marker where fundamentals conflict
- provider-specific values in an expandable comparison

It must not collapse `CONFLICT` into a fake consensus.
