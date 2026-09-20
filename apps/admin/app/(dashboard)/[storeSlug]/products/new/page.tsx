import type { CategoryNode, MetafieldDefinitionSummary, TaxClassSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ProductForm } from "../product-form";

export const metadata = { title: "New product · Ocean Admin" };

export default async function NewProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/products/new");
  if (!can(store, "products.write"))
    return <Alert variant="warning">Your role cannot create products.</Alert>;

  const cookie = await cookieHeader();
  const canReadTaxes = can(store, "taxes.read");
  const [categories, definitions, taxClasses] = await Promise.all([
    api<{ data: CategoryNode[] }>(`/stores/${store.id}/categories`, { cookie }),
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=product`,
      { cookie },
    ),
    canReadTaxes
      ? api<{ data: TaxClassSummary[] }>(`/stores/${store.id}/tax/classes`, { cookie })
      : Promise.resolve({ data: [] as TaxClassSummary[] }),
  ]);

  return (
    <ProductForm
      storeId={store.id}
      storeSlug={store.slug}
      currency={store.defaultCurrency}
      categories={categories.data}
      definitions={definitions.data}
      taxClasses={taxClasses.data}
      product={null}
      metafields={[]}
      canDelete={false}
    />
  );
}
