import type { CatalogDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CatalogDetailView } from "./catalog-detail";

export const metadata = { title: "Catalog · Ocean Admin" };

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ storeSlug: string; catalogId: string }>;
}) {
  const { storeSlug, catalogId } = await params;
  const { store } = await loadStorePage(storeSlug, `/catalogs/${catalogId}`);
  if (!can(store, "catalogs.read"))
    return <Alert variant="warning">Your role cannot view catalogs.</Alert>;
  let catalog: CatalogDetail;
  try {
    catalog = (
      await api<{ data: CatalogDetail }>(`/stores/${store.id}/catalogs/${catalogId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <CatalogDetailView
      storeId={store.id}
      storeSlug={store.slug}
      catalog={catalog}
      canWrite={can(store, "catalogs.write")}
    />
  );
}
