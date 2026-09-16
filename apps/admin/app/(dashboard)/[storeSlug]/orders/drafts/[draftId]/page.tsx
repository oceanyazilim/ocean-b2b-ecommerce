import type { DraftOrderDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { DraftOrderEditor } from "../draft-order-editor";

export const metadata = { title: "Draft order · Ocean Admin" };

export default async function DraftOrderPage({
  params,
}: {
  params: Promise<{ storeSlug: string; draftId: string }>;
}) {
  const { storeSlug, draftId } = await params;
  const { store } = await loadStorePage(storeSlug, `/orders/drafts/${draftId}`);
  if (!can(store, "orders.read"))
    return <Alert variant="warning">Your role cannot view orders.</Alert>;
  let draft: DraftOrderDetail;
  try {
    draft = (
      await api<{ data: DraftOrderDetail }>(`/stores/${store.id}/draft-orders/${draftId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <DraftOrderEditor
      storeId={store.id}
      storeSlug={store.slug}
      draft={draft}
      canWrite={can(store, "orders.write")}
    />
  );
}
