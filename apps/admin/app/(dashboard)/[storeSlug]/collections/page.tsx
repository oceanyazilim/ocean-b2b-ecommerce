import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CollectionsList } from "./collections-list";

export const metadata = { title: "Collections · Ocean Admin" };

export default async function CollectionsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/collections");
  if (!can(store, "collections.read"))
    return <Alert variant="warning">Your role cannot view collections.</Alert>;
  return (
    <CollectionsList
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "collections.write")}
    />
  );
}
