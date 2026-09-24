import type { Metadata } from "next";

import "./globals.css";
import "./terminal.css";

export const metadata: Metadata = {
  title: "Underly — Know what you really hold",
  description:
    "Read-only tokenized-equity wrapper, market and wallet intelligence on BNB Smart Chain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
