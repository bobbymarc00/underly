import Link from "next/link";

interface StockPageProps {
  params: Promise<{
    ticker: string;
  }>;
}

export default async function StockPage({
  params,
}: StockPageProps) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  return (
    <main
      style={{
        width: "min(1180px, calc(100% - 32px))",
        margin: "0 auto",
        padding: "48px 0 8px",
      }}
    >
      <Link href="/">← UNDERLY</Link>
      <div
        style={{
          marginTop: 24,
          opacity: 0.62,
          fontSize: 12,
          letterSpacing: "0.14em",
          fontWeight: 700,
        }}
      >
        STOCK DETAIL FOUNDATION
      </div>
      <h1 style={{ margin: "8px 0 8px", fontSize: 48 }}>
        {ticker}
      </h1>
      <p style={{ margin: 0, opacity: 0.7, maxWidth: 720 }}>
        This route is intentionally minimal until the final stock-terminal UI.
        The related-news section below is already ticker-scoped. Historical
        wrapper charts, company fundamentals, liquidity and corporate actions
        remain served by their normalized backend APIs.
      </p>
    </main>
  );
}
