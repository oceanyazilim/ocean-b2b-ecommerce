import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CatalogsList } from "./catalogs-list";

export const metadata = { title: "Catalogs · Ocean Admin" };

export default async function CatalogsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/catalogs");
  if (!can(store, "catalogs.read")) {
    return <Alert variant="warning">Your role cannot view catalogs.</Alert>;
  }
  return (
    <CatalogsList
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "catalogs.write")}
    />
  );
}
