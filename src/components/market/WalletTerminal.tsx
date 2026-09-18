"use client";

import { FormEvent, useState, type ChangeEvent } from "react";
import Link from "next/link";

import { providerLabel } from "@/lib/ui/format";
import type { WalletInspectorPayload } from "@/lib/ui/market-types";

import { TerminalHeader } from "./TerminalHeader";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

function compactAddress(value: string): string {
  if (value.length < 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function WalletTerminal() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<WalletInspectorPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function inspect(event: FormEvent) {
    event.preventDefault();
    const clean = address.trim();

    if (!EVM_ADDRESS.test(clean)) {
      setError("Enter a valid public EVM address.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/wallet-inspector?address=${encodeURIComponent(clean)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as WalletInspectorPayload;

      if (!response.ok && !body.status) {
        throw new Error(`HTTP ${response.status}`);
      }

      setResult(body);
      if (!response.ok && body.status !== "NOT_CONFIGURED") {
        setError(body.error ?? body.note ?? `HTTP ${response.status}`);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Wallet inspection failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="tm-app">
      <TerminalHeader active="wallet" />

      <section className="tm-shell tm-wallet-head">
        <div className="tm-eyebrow">PUBLIC ADDRESS · READ ONLY</div>
        <h1>Tokenized-equity holdings.</h1>
        <p>
          Underly checks only wrapper contracts present in the Binance Web3 RWA
          universe. No connection, signature, approval, private key or seed
          phrase is requested.
        </p>

        <form className="tm-wallet-form" onSubmit={inspect}>
          <input
            value={address}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setAddress(event.target.value)}
            placeholder="0x public BNB Smart Chain address"
            aria-label="Public wallet address"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={loading}>
            {loading ? "READING SNAPSHOT…" : "INSPECT ADDRESS"}
          </button>
        </form>
      </section>

      {error && (
        <section className="tm-shell">
          <div className="tm-callout tm-callout-error">
            <span>{result?.status ?? "REQUEST FAILED"}</span>
            <strong>{error}</strong>
            <small>Failed balance reads are never treated as zero.</small>
          </div>
        </section>
      )}

      {result && (
        <>
          <section className="tm-shell tm-stat-strip tm-wallet-stats">
            <div>
              <span>STATUS</span>
              <strong>{result.status}</strong>
            </div>
            <div>
              <span>KNOWN WRAPPERS</span>
              <strong>{result.summary?.knownWrapperCount ?? "—"}</strong>
            </div>
            <div>
              <span>HOLDINGS</span>
              <strong>{result.summary?.holdingCount ?? result.holdings.length}</strong>
            </div>
            <div>
              <span>FAILED READS</span>
              <strong>{result.summary?.failedChecks ?? "—"}</strong>
            </div>
            <div className="tm-stat-wide">
              <span>SNAPSHOT BLOCK</span>
              <strong>{result.snapshot?.blockNumber ?? "—"}</strong>
            </div>
          </section>

          <section className="tm-shell tm-wallet-results">
            <div className="tm-section-head">
              <div>
                <span>DETECTED HOLDINGS</span>
                <h2>{compactAddress(result.address)}</h2>
              </div>
              <div className="tm-readonly-badge">
                <i />
                RPC READ ONLY
              </div>
            </div>

            {result.holdings.length === 0 ? (
              <div className="tm-empty-holdings">
                <strong>No matching non-zero tokenized-equity holdings.</strong>
                <p>
                  This is a valid result when all known wrapper reads succeed.
                  It does not mean the address has no other assets.
                </p>
              </div>
            ) : (
              <div className="tm-market-table-wrap">
                <table className="tm-market-table tm-wallet-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Wrapper</th>
                      <th>Provider</th>
                      <th>Quantity</th>
                      <th>Contract</th>
                      <th>Block</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdings.map((holding) => (
                      <tr key={holding.contractAddress}>
                        <td>
                          <Link
                            href={`/stock/${encodeURIComponent(holding.ticker)}`}
                          >
                            {holding.ticker}
                          </Link>
                        </td>
                        <td>{holding.symbol}</td>
                        <td>{providerLabel(holding.platform)}</td>
                        <td>{holding.quantity ?? "DECIMALS UNKNOWN"}</td>
                        <td title={holding.contractAddress}>
                          {compactAddress(holding.contractAddress)}
                        </td>
                        <td>{result.snapshot?.blockNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="tm-wallet-proof">
              <span>
                RPC METHODS · {result.readOnly.rpcMethods.join(" · ") || "NONE"}
              </span>
              <span>
                TRANSACTION METHODS ·{" "}
                {result.readOnly.transactionMethods.length
                  ? result.readOnly.transactionMethods.join(" · ")
                  : "NONE"}
              </span>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
