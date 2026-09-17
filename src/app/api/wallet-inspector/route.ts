import { NextRequest, NextResponse } from "next/server";

import {
  listBscRwaTokens,
  type RwaTokenListRow,
} from "@/lib/binance/rwa";
import {
  isEvmAddress,
  normalizeEvmAddress,
  parseHexQuantity,
} from "@/lib/wallet/evm-rpc";
import { getConfiguredWalletRpc } from "@/lib/wallet/provider";
import {
  inspectWalletSnapshot,
  prepareWalletWrappers,
} from "@/lib/wallet/inspector";

export const runtime = "nodejs";

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function configuredChainId(): string | null {
  const raw = (process.env.UNDERLY_CHAIN_ID || "56").trim();
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw).toString(10);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const suppliedAddress = url.searchParams.get("address")?.trim() ?? "";

  if (!suppliedAddress) {
    return jsonNoStore({ error: "address is required" }, 400);
  }

  if (!isEvmAddress(suppliedAddress)) {
    return jsonNoStore({ error: "address must be a valid EVM address" }, 400);
  }

  const chainId = configuredChainId();
  const address = normalizeEvmAddress(suppliedAddress);
  const generatedAt = new Date().toISOString();

  if (chainId === null) {
    return jsonNoStore(
      {
        version: "0.2.7",
        generatedAt,
        address,
        status: "NOT_CONFIGURED",
        holdings: [],
        checks: [],
        note: "UNDERLY_CHAIN_ID must be a non-negative decimal integer.",
        readOnly: {
          enabled: true,
          rpcMethods: [],
          transactionMethods: [],
        },
      },
      503,
    );
  }

  const configuredRpc = getConfiguredWalletRpc();
  if (configuredRpc.status === "NOT_CONFIGURED") {
    return jsonNoStore(
      {
        version: "0.2.7",
        generatedAt,
        address,
        chainId,
        status: "NOT_CONFIGURED",
        holdings: [],
        checks: [],
        note: configuredRpc.reason,
        readOnly: {
          enabled: true,
          rpcMethods: ["eth_chainId", "eth_blockNumber", "eth_call"],
          transactionMethods: [],
        },
      },
      503,
    );
  }

  try {
    const rpc = configuredRpc.rpc;
    const rpcChainTag = await rpc.getChainId();
    const rpcChainId = parseHexQuantity(rpcChainTag).toString(10);

    if (rpcChainId !== chainId) {
      return jsonNoStore(
        {
          version: "0.2.7",
          generatedAt,
          address,
          chainId,
          status: "UNAVAILABLE",
          error: "RPC_CHAIN_MISMATCH",
          expectedChainId: chainId,
          observedRpcChainId: rpcChainId,
          holdings: [],
          checks: [],
          readOnly: {
            enabled: true,
            rpcMethods: ["eth_chainId"],
            transactionMethods: [],
          },
        },
        502,
      );
    }

    const blockTag = await rpc.getBlockNumber();
    const blockNumber = parseHexQuantity(blockTag).toString(10);

    const universe = await listBscRwaTokens(chainId);
    if (universe.code !== 0) {
      return jsonNoStore(
        {
          version: "0.2.7",
          generatedAt,
          address,
          chainId,
          status: "UNAVAILABLE",
          error: universe.msg,
          upstreamCode: universe.code,
          holdings: [],
          checks: [],
          snapshot: {
            blockTag,
            blockNumber,
          },
          readOnly: {
            enabled: true,
            rpcMethods: ["eth_chainId", "eth_blockNumber"],
            transactionMethods: [],
          },
        },
        502,
      );
    }

    const wrappers = prepareWalletWrappers(
      (universe.data ?? []) as RwaTokenListRow[],
      chainId,
    );
    const inspection = await inspectWalletSnapshot({
      address,
      blockTag,
      wrappers,
      rpc,
    });

    const payload = {
      version: "0.2.7",
      generatedAt,
      address,
      chainId,
      status: inspection.state,
      scope: "TOKENIZED_EQUITY_WRAPPERS_ONLY",
      snapshot: {
        rpcChainId,
        blockTag,
        blockNumber,
      },
      summary: {
        knownWrapperCount: wrappers.length,
        successfulChecks: inspection.successfulChecks,
        failedChecks: inspection.failedChecks,
        holdingCount: inspection.holdings.length,
      },
      holdings: inspection.holdings,
      checks: inspection.checks,
      sources: {
        wrapperUniverse: "binance_web3_rwa",
        balances: "evm_json_rpc",
      },
      methodology: {
        matching:
          "Underly inspects only wrapper contracts present in the Binance Web3 RWA universe for the configured chain.",
        snapshot:
          "All ERC-20 balanceOf calls use the same explicit block tag returned by eth_blockNumber.",
        quantities:
          "Raw RPC balance hex is preserved. Decimal-normalized quantity is emitted only when Binance supplies valid token decimals; otherwise quantity is null.",
        failures:
          "Individual balance read failures remain explicit in checks. Underly never infers or fabricates a holding from a failed read.",
      },
      readOnly: {
        enabled: true,
        rpcMethods: ["eth_chainId", "eth_blockNumber", "eth_call"],
        transactionMethods: [],
        privateKeyRequired: false,
        signatureRequired: false,
        approvalRequired: false,
      },
    };

    return jsonNoStore(
      payload,
      inspection.state === "UNAVAILABLE" ? 502 : 200,
    );
  } catch (error) {
    return jsonNoStore(
      {
        version: "0.2.7",
        generatedAt,
        address,
        chainId,
        status: "UNAVAILABLE",
        holdings: [],
        checks: [],
        error:
          error instanceof Error ? error.message : "Wallet inspection failed",
        readOnly: {
          enabled: true,
          rpcMethods: ["eth_chainId", "eth_blockNumber", "eth_call"],
          transactionMethods: [],
        },
      },
      502,
    );
  }
}
