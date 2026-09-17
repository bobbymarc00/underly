# Underly v0.2.7 — Read-only Wallet Inspector

## Boundary

The wallet inspector accepts **only a public EVM address**. It does not request, store, or use:

- seed phrases
- private keys
- wallet signatures
- ERC-20 approvals
- transaction signing
- transaction broadcast

The feature is informational and read-only.

## Endpoint

```text
GET /api/wallet-inspector?address=0x...
```

The configured chain remains `UNDERLY_CHAIN_ID` (default `56`). A read-only JSON-RPC endpoint is configured separately:

```text
UNDERLY_RPC_URL=
```

The RPC URL is never returned in the API payload because provider URLs may contain credentials.

## Evidence flow

1. Validate the supplied public EVM address.
2. Call `eth_chainId` and require it to equal `UNDERLY_CHAIN_ID`.
3. Freeze one explicit snapshot with `eth_blockNumber`.
4. Load the current Binance Web3 RWA wrapper universe for the configured chain.
5. Deduplicate wrapper contracts.
6. Call ERC-20 `balanceOf(address)` using `eth_call` at the **same block tag** for every wrapper.
7. Preserve the raw balance hex and decimal base-unit value.
8. Emit a decimal-normalized quantity only when Binance supplies valid token decimals.
9. Return non-zero known wrapper balances as holdings.

No unknown token contract is promoted into a tokenized-equity holding merely because it exists in the wallet. Membership comes from the Binance wrapper universe.

## Status semantics

| Status | HTTP | Meaning |
| --- | ---: | --- |
| `AVAILABLE` | 200 | Every known wrapper balance check succeeded, including a valid zero-holdings result. |
| `PARTIAL` | 200 | At least one wrapper check succeeded and at least one failed. Failed rows remain explicit. |
| `UNAVAILABLE` | 502 | Chain/snapshot/upstream failed, or every known wrapper balance check failed. |
| `NOT_CONFIGURED` | 503 | `UNDERLY_RPC_URL` is absent. |

A failed balance read never becomes a zero balance and never becomes a holding.

## Read methods

The v0.2.7 RPC adapter exposes only:

```text
eth_chainId
eth_blockNumber
eth_call
```

There is no transaction method in the adapter surface.

## Snapshot consistency

All `balanceOf` calls receive the exact block tag returned from `eth_blockNumber`. This prevents a single response from silently mixing balances observed at different block heights.

## Scope

v0.2.7 detects tokenized-equity wrapper balances only. It does not attempt to provide a complete wallet portfolio, native-token balance, DeFi positions, NFTs, allowances, transaction history, or execution capability.
