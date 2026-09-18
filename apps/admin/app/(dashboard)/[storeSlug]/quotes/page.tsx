import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesList } from "./quotes-list";
import { QuotesShell } from "./quotes-shell";

export const metadata = { title: "Quotes · Ocean Admin" };

export default async function QuotesPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "quotes.read") ? (
        <QuotesList storeId={store.id} storeSlug={store.slug} canWrite={can(store, "quotes.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view quotes.</Alert>
      )}
    </QuotesShell>
  );
}
