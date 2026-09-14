import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { InventoryShell } from "../inventory-shell";
import { LocationsManager } from "./locations-manager";

export const metadata = { title: "Locations · Ocean Admin" };

export default async function LocationsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/inventory/locations");
  if (!can(store, "inventory.read"))
    return <Alert variant="warning">Your role cannot view inventory.</Alert>;
  return (
    <InventoryShell storeSlug={store.slug}>
      <LocationsManager storeId={store.id} canWrite={can(store, "inventory.write")} />
    </InventoryShell>
  );
}
