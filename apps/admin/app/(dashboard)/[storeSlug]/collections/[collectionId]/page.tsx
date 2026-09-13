import type { CollectionDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CollectionForm } from "../collection-form";

export const metadata = { title: "Edit collection · Ocean Admin" };

export default async function EditCollectionPage({
  params,
}: {
  params: Promise<{ storeSlug: string; collectionId: string }>;
}) {
  const { storeSlug, collectionId } = await params;
  const { store } = await loadStorePage(storeSlug, `/collections/${collectionId}`);
  if (!can(store, "collections.read"))
    return <Alert variant="warning">Your role cannot view collections.</Alert>;

  let collection: CollectionDetail;
  try {
    collection = (
      await api<{ data: CollectionDetail }>(`/stores/${store.id}/collections/${collectionId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <CollectionForm
      storeId={store.id}
      storeSlug={store.slug}
      collection={collection}
      readOnly={!can(store, "collections.write")}
    />
  );
}
