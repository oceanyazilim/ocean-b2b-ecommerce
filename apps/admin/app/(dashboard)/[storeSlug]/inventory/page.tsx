import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { InventoryShell } from "./inventory-shell";
import { StockList } from "./stock-list";

export const metadata = { title: "Inventory · Ocean Admin" };

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/inventory");
  if (!can(store, "inventory.read"))
    return <Alert variant="warning">Your role cannot view inventory.</Alert>;
  return (
    <InventoryShell storeSlug={store.slug}>
      <StockList
        storeId={store.id}
        storeSlug={store.slug}
        canWrite={can(store, "inventory.write")}
      />
    </InventoryShell>
  );
}
