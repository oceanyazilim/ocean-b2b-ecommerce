import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesShell } from "../quotes-shell";
import { DiscountsManager } from "./discounts-manager";

export const metadata = { title: "Discounts · Ocean Admin" };

export default async function DiscountsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/discounts");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "discounts.read") ? (
        <DiscountsManager storeId={store.id} canWrite={can(store, "discounts.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view discounts.</Alert>
      )}
    </QuotesShell>
  );
}
