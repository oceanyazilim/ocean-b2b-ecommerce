import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CustomersList } from "./customers-list";

export const metadata = { title: "Customers · Ocean Admin" };

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/customers");
  if (!can(store, "customers.read")) {
    return <Alert variant="warning">Your role cannot view customers.</Alert>;
  }
  return (
    <CustomersList
      storeId={store.id}
      storeSlug={store.slug}
      canWrite={can(store, "customers.write")}
    />
  );
}
