import type {
  CategoryNode,
  MetafieldDefinitionSummary,
  MetafieldValue,
  ProductDetail,
  TaxClassSummary,
} from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ProductForm } from "../product-form";

export const metadata = { title: "Edit product · Ocean Admin" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string; productId: string }>;
}) {
  const { storeSlug, productId } = await params;
  const { store } = await loadStorePage(storeSlug, `/products/${productId}`);
  if (!can(store, "products.read"))
    return <Alert variant="warning">Your role cannot view products.</Alert>;

  const cookie = await cookieHeader();
  let product: ProductDetail;
  try {
    product = (
      await api<{ data: ProductDetail }>(`/stores/${store.id}/products/${productId}`, { cookie })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  const canReadTaxes = can(store, "taxes.read");
  const [categories, definitions, metafields, taxClasses] = await Promise.all([
    api<{ data: CategoryNode[] }>(`/stores/${store.id}/categories`, { cookie }),
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=product`,
      { cookie },
    ),
    api<{ data: MetafieldValue[] }>(`/stores/${store.id}/products/${productId}/metafields`, {
      cookie,
    }),
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
      product={product}
      metafields={metafields.data}
      canDelete={can(store, "products.delete")}
      readOnly={!can(store, "products.write")}
    />
  );
}
