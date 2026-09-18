import type { Metadata } from "next";

import { WalletTerminal } from "@/components/market/WalletTerminal";

export const metadata: Metadata = {
  title: "Wallet · Underly",
  description:
    "Read-only public-address tokenized-equity holdings inspection on BNB Smart Chain.",
};

export default function WalletPage() {
  return <WalletTerminal />;
}
