# API v0.2.7 Addendum

## `GET /api/wallet-inspector`

Query parameters:

- `address` — required public EVM address.

Successful response shape (abridged):

```json
{
  "version": "0.2.7",
  "address": "0x...",
  "chainId": "56",
  "status": "AVAILABLE",
  "scope": "TOKENIZED_EQUITY_WRAPPERS_ONLY",
  "snapshot": {
    "rpcChainId": "56",
    "blockTag": "0x...",
    "blockNumber": "..."
  },
  "summary": {
    "knownWrapperCount": 0,
    "successfulChecks": 0,
    "failedChecks": 0,
    "holdingCount": 0
  },
  "holdings": [],
  "checks": [],
  "readOnly": {
    "enabled": true,
    "rpcMethods": ["eth_chainId", "eth_blockNumber", "eth_call"],
    "transactionMethods": [],
    "privateKeyRequired": false,
    "signatureRequired": false,
    "approvalRequired": false
  }
}
```

`checks` is the complete evidence set for known wrappers. A check with `status: "ERROR"` has null balance fields and an explicit error; it is never treated as zero.
