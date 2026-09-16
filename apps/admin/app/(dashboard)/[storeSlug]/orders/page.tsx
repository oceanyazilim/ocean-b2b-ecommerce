import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { OrdersList } from "./orders-list";
import { OrdersShell } from "./orders-shell";

export const metadata = { title: "Orders · Ocean Admin" };

export default async function OrdersPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/orders");
  if (!can(store, "orders.read")) {
    return <Alert variant="warning">Your role cannot view orders.</Alert>;
  }
  return (
    <OrdersShell storeSlug={store.slug}>
      <OrdersList storeId={store.id} storeSlug={store.slug} />
    </OrdersShell>
  );
}
