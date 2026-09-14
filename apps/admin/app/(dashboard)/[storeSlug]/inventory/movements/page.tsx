import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { InventoryShell } from "../inventory-shell";
import { MovementsLedger } from "./movements-ledger";

export const metadata = { title: "Stock movements · Ocean Admin" };

export default async function MovementsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/inventory/movements");
  if (!can(store, "inventory.read"))
    return <Alert variant="warning">Your role cannot view inventory.</Alert>;
  return (
    <InventoryShell storeSlug={store.slug}>
      <MovementsLedger storeId={store.id} />
    </InventoryShell>
  );
}
