import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Underly — Know what you really hold",
  description: "Tokenized-equity identity, reference, execution and valuation inspection.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
