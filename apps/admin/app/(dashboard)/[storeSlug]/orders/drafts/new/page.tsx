import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { DraftOrderEditor } from "../draft-order-editor";

export const metadata = { title: "New draft order · Ocean Admin" };

export default async function NewDraftOrderPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/orders/drafts/new");
  if (!can(store, "orders.write"))
    return <Alert variant="warning">Your role cannot create orders.</Alert>;
  return <DraftOrderEditor storeId={store.id} storeSlug={store.slug} draft={null} canWrite />;
}
