import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { ShippingZonesManager } from "./shipping-zones-manager";

export const metadata = { title: "Shipping · Ocean Admin" };

export default async function ShippingPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/settings/shipping");
  if (!can(store, "shipping.read"))
    return <Alert variant="warning">Your role cannot view shipping settings.</Alert>;
  return (
    <ShippingZonesManager
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "shipping.write")}
    />
  );
}
