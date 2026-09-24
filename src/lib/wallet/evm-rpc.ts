import "server-only";

const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const HEX_QUANTITY_PATTERN = /^0x[0-9a-fA-F]+$/;
const BALANCE_OF_SELECTOR = "70a08231";

export class WalletRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletRpcError";
  }
}

export interface Erc20BalanceEvidence {
  rawHex: string;
  baseUnits: string;
}

export interface EvmReadOnlyRpc {
  getChainId(): Promise<string>;
  getBlockNumber(): Promise<string>;
  getErc20Balance(
    contractAddress: string,
    walletAddress: string,
    blockTag: string,
  ): Promise<Erc20BalanceEvidence>;
}

interface JsonRpcSuccess {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
}

export function isEvmAddress(value: string): boolean {
  return EVM_ADDRESS_PATTERN.test(value);
}

export function normalizeEvmAddress(value: string): string {
  if (!isEvmAddress(value)) {
    throw new Error("Invalid EVM address");
  }
  return value.toLowerCase();
}

export function parseDecimals(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) return null;
  return parsed;
}

export function parseHexQuantity(value: string): bigint {
  if (!HEX_QUANTITY_PATTERN.test(value)) {
    throw new WalletRpcError("RPC returned an invalid hex quantity");
  }
  return BigInt(value);
}

export function formatBaseUnits(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("Invalid token decimals");
  }

  const digits = value.toString(10);
  if (decimals === 0) return digits;

  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function encodeBalanceOf(walletAddress: string): string {
  const normalized = normalizeEvmAddress(walletAddress).slice(2);
  return `0x${BALANCE_OF_SELECTOR}${normalized.padStart(64, "0")}`;
}

function assertContractAddress(value: string): string {
  if (!isEvmAddress(value)) {
    throw new WalletRpcError("Wrapper contract address is not a valid EVM address");
  }
  return value.toLowerCase();
}

function assertHexQuantity(value: unknown, label: string): string {
  if (typeof value !== "string" || !HEX_QUANTITY_PATTERN.test(value)) {
    throw new WalletRpcError(`RPC returned an invalid ${label}`);
  }
  return value.toLowerCase();
}

export function createEvmReadOnlyRpc(
  rpcUrl: string,
  fetchImpl: typeof fetch = fetch,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): EvmReadOnlyRpc {
  if (!rpcUrl.trim()) {
    throw new WalletRpcError("RPC URL is not configured");
  }

  let requestId = 0;

  async function call(method: string, params: unknown[]): Promise<unknown> {
    requestId += 1;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromParent = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
      abortFromParent();
    } else {
      options.signal?.addEventListener("abort", abortFromParent, { once: true });
    }
    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, options.timeoutMs);

    let response: Response;
    try {
      response = await fetchImpl(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method,
          params,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new WalletRpcError(
          timedOut ? "RPC request timed out" : "RPC request aborted",
        );
      }
      // Do not include the RPC URL in errors because it may contain credentials.
      throw new WalletRpcError("RPC transport failed");
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    }

    if (!response.ok) {
      throw new WalletRpcError(`RPC returned HTTP ${response.status}`);
    }

    let payload: JsonRpcSuccess;
    try {
      payload = (await response.json()) as JsonRpcSuccess;
    } catch {
      throw new WalletRpcError("RPC returned non-JSON data");
    }

    if (payload.error) {
      const code = payload.error.code;
      const message = payload.error.message?.trim();
      throw new WalletRpcError(
        `RPC error${code === undefined ? "" : ` ${code}`}${message ? `: ${message}` : ""}`,
      );
    }

    if (!("result" in payload)) {
      throw new WalletRpcError("RPC response is missing result");
    }

    return payload.result;
  }

  return {
    async getChainId() {
      return assertHexQuantity(await call("eth_chainId", []), "chain id");
    },

    async getBlockNumber() {
      return assertHexQuantity(
        await call("eth_blockNumber", []),
        "block number",
      );
    },

    async getErc20Balance(contractAddress, walletAddress, blockTag) {
      const contract = assertContractAddress(contractAddress);
      const tag = assertHexQuantity(blockTag, "block tag");
      const result = assertHexQuantity(
        await call("eth_call", [
          {
            to: contract,
            data: encodeBalanceOf(walletAddress),
          },
          tag,
        ]),
        "ERC-20 balance",
      );

      return {
        rawHex: result,
        baseUnits: parseHexQuantity(result).toString(10),
      };
    },
  };
}
