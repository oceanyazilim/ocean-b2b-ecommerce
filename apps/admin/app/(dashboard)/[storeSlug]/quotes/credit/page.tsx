import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { QuotesShell } from "../quotes-shell";
import { CreditManager } from "./credit-manager";

export const metadata = { title: "Credit accounts · Ocean Admin" };

export default async function CreditPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/quotes/credit");
  return (
    <QuotesShell storeSlug={store.slug}>
      {can(store, "credit.read") ? (
        <CreditManager storeId={store.id} canWrite={can(store, "credit.write")} />
      ) : (
        <Alert variant="warning">Your role cannot view credit accounts.</Alert>
      )}
    </QuotesShell>
  );
}
