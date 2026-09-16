import type { MetafieldDefinitionSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CustomerForm } from "../customer-form";

export const metadata = { title: "New customer · Ocean Admin" };

export default async function NewCustomerPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/customers/new");
  if (!can(store, "customers.write"))
    return <Alert variant="warning">Your role cannot create customers.</Alert>;
  const definitions = await api<{ data: MetafieldDefinitionSummary[] }>(
    `/stores/${store.id}/metafield-definitions?ownerType=customer`,
    { cookie: await cookieHeader() },
  );
  return (
    <CustomerForm
      storeId={store.id}
      storeSlug={store.slug}
      customer={null}
      definitions={definitions.data}
      metafields={[]}
    />
  );
}
