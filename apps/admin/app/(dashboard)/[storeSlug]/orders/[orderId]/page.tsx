import type { OrderDetail } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { OrderDetailView } from "./order-detail";

export const metadata = { title: "Order · Ocean Admin" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ storeSlug: string; orderId: string }>;
}) {
  const { storeSlug, orderId } = await params;
  const { store } = await loadStorePage(storeSlug, `/orders/${orderId}`);
  if (!can(store, "orders.read"))
    return <Alert variant="warning">Your role cannot view orders.</Alert>;
  let order: OrderDetail;
  try {
    order = (
      await api<{ data: OrderDetail }>(`/stores/${store.id}/orders/${orderId}`, {
        cookie: await cookieHeader(),
      })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  return (
    <OrderDetailView
      storeId={store.id}
      storeSlug={store.slug}
      order={order}
      canWrite={can(store, "orders.write")}
    />
  );
}
