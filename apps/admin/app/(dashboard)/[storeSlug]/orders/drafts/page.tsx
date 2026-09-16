import { Alert, Button } from "@ocean/ui";
import Link from "next/link";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { OrdersShell } from "../orders-shell";
import { DraftsList } from "./drafts-list";

export const metadata = { title: "Draft orders · Ocean Admin" };

export default async function DraftOrdersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/orders/drafts");
  if (!can(store, "orders.read"))
    return <Alert variant="warning">Your role cannot view orders.</Alert>;
  return (
    <OrdersShell
      storeSlug={store.slug}
      actions={
        can(store, "orders.write") ? (
          <Link href={`/${store.slug}/orders/drafts/new`}>
            <Button>New draft order</Button>
          </Link>
        ) : undefined
      }
    >
      <DraftsList storeId={store.id} storeSlug={store.slug} canWrite={can(store, "orders.write")} />
    </OrdersShell>
  );
}
