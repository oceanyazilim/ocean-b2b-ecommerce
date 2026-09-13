import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ProductsList } from "./products-list";

export const metadata = { title: "Products · Ocean Admin" };

export default async function ProductsPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/products");
  if (!can(store, "products.read")) {
    return <Alert variant="warning">Your role cannot view products.</Alert>;
  }
  return (
    <ProductsList
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "products.write")}
      canDelete={can(store, "products.delete")}
    />
  );
}
