import type { Metadata } from "next";
import "./globals.css";
import { NewsDock } from "@/components/news/NewsDock";

export const metadata: Metadata = {
  title: "Underly â€” Know what you really hold",
  description: "Compare tokenized-equity wrappers across identity, pricing, execution, valuation, ActionGuard findings and evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<NewsDock />
      </body>
    </html>
  );
}

