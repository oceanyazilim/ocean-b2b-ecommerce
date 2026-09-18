import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesShell } from "../quotes-shell";
import { InvoicesManager } from "./invoices-manager";

export const metadata = { title: "Invoices · Ocean Admin" };

export default async function InvoicesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/invoices");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "finance.read") ? (
        <InvoicesManager storeId={store.id} storeSlug={store.slug} canWrite={can(store, "finance.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view invoices.</Alert>
      )}
    </QuotesShell>
  );
}
