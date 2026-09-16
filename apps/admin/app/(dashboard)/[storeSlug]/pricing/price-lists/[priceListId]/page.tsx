import type { PriceListDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PriceListDetailView } from "./price-list-detail";

export const metadata = { title: "Price list · Ocean Admin" };

export default async function PriceListPage({
  params,
}: {
  params: Promise<{ storeSlug: string; priceListId: string }>;
}) {
  const { storeSlug, priceListId } = await params;
  const { store } = await loadStorePage(storeSlug, `/pricing/price-lists/${priceListId}`);
  if (!can(store, "pricing.read"))
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  let priceList: PriceListDetail;
  try {
    priceList = (
      await api<{ data: PriceListDetail }>(`/stores/${store.id}/price-lists/${priceListId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <PriceListDetailView
      storeId={store.id}
      storeSlug={store.slug}
      priceList={priceList}
      canWrite={can(store, "pricing.write")}
    />
  );
}
