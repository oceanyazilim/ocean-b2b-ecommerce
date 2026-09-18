import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesShell } from "../quotes-shell";
import { SavedListsManager } from "./saved-lists-manager";

export const metadata = { title: "Saved lists · Ocean Admin" };

export default async function SavedListsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/saved-lists");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "savedLists.read") ? (
        <SavedListsManager storeId={store.id} canWrite={can(store, "savedLists.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view saved lists.</Alert>
      )}
    </QuotesShell>
  );
}
