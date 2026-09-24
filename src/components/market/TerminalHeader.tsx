"use client";

import Link from "next/link";

import { TickerSearch } from "./TickerSearch";

export function TerminalHeader({
  active,
  ticker,
}: {
  active?: "markets" | "wallet" | "inspector";
  ticker?: string;
}) {
  return (
    <header className="tm-header">
      <div className="tm-header-inner">
        <Link href="/" className="tm-brand" aria-label="Underly markets">
          <span className="tm-brand-mark">U</span>
          <span>UNDERLY</span>
        </Link>

        <div className="tm-header-search">
          <TickerSearch compact initialValue={ticker ?? ""} />
        </div>

        <nav className="tm-nav" aria-label="Primary navigation">
          <Link
            href="/"
            data-active={active === "markets"}
            aria-current={active === "markets" ? "page" : undefined}
          >
            MARKETS
          </Link>
          <Link
            href="/wallet"
            data-active={active === "wallet"}
            aria-current={active === "wallet" ? "page" : undefined}
          >
            WALLET
          </Link>
          <Link
            href="/inspect"
            data-active={active === "inspector"}
            aria-current={active === "inspector" ? "page" : undefined}
          >
            INSPECTOR
          </Link>
        </nav>

        <div className="tm-network">
          <i />
          <span>BNB · READ ONLY</span>
        </div>
      </div>
    </header>
  );
}
