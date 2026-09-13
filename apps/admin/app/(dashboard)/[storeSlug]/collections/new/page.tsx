import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CollectionForm } from "../collection-form";

export const metadata = { title: "New collection · Ocean Admin" };

export default async function NewCollectionPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/collections/new");
  if (!can(store, "collections.write"))
    return <Alert variant="warning">Your role cannot create collections.</Alert>;
  return <CollectionForm storeId={store.id} storeSlug={store.slug} collection={null} />;
}
