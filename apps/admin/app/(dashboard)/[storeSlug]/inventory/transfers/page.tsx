import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { InventoryShell } from "../inventory-shell";
import { TransfersBoard } from "./transfers-board";

export const metadata = { title: "Transfers · Ocean Admin" };

export default async function TransfersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/inventory/transfers");
  if (!can(store, "inventory.read"))
    return <Alert variant="warning">Your role cannot view inventory.</Alert>;
  return (
    <InventoryShell storeSlug={store.slug}>
      <TransfersBoard storeId={store.id} canWrite={can(store, "inventory.write")} />
    </InventoryShell>
  );
}
