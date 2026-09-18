import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuoteEditor } from "../quote-editor";

export const metadata = { title: "New quote · Ocean Admin" };

export default async function NewQuotePage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/new");
  if (!can(store, "quotes.write")) {
    return <Alert variant="warning">Your role cannot create quotes.</Alert>;
  }
  return <QuoteEditor storeId={store.id} storeSlug={store.slug} quote={null} canWrite />;
}
