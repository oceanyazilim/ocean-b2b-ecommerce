import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesShell } from "../quotes-shell";
import { ApprovalsManager } from "./approvals-manager";

export const metadata = { title: "Approvals · Ocean Admin" };

export default async function ApprovalsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/approvals");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "approvals.read") ? (
        <ApprovalsManager storeId={store.id} storeSlug={store.slug} canWrite={can(store, "approvals.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view approvals.</Alert>
      )}
    </QuotesShell>
  );
}
