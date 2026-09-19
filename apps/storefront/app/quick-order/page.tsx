import type { Metadata } from "next";

import { QuickOrderView } from "@/components/quick-order-view";

export const metadata: Metadata = {
  title: "Quick order",
};

export default function QuickOrderPage() {
  return <QuickOrderView />;
}
