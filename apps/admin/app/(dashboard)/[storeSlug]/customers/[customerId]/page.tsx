import type { CustomerDetail, MetafieldDefinitionSummary, MetafieldValue } from "@ocean/types";
import { Alert } from "@ocean/ui";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { CustomerForm } from "../customer-form";

export const metadata = { title: "Customer · Ocean Admin" };

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ storeSlug: string; customerId: string }>;
}) {
  const { storeSlug, customerId } = await params;
  const { store } = await loadStorePage(storeSlug, `/customers/${customerId}`);
  if (!can(store, "customers.read"))
    return <Alert variant="warning">Your role cannot view customers.</Alert>;

  const cookie = await cookieHeader();
  let customer: CustomerDetail;
  try {
    customer = (
      await api<{ data: CustomerDetail }>(`/stores/${store.id}/customers/${customerId}`, { cookie })
    ).data;
  } catch (err) {
    if (isApiError(err, "not_found")) notFound();
    throw err;
  }
  const [definitions, metafields] = await Promise.all([
    api<{ data: MetafieldDefinitionSummary[] }>(
      `/stores/${store.id}/metafield-definitions?ownerType=customer`,
      { cookie },
    ),
    api<{ data: MetafieldValue[] }>(`/stores/${store.id}/customers/${customerId}/metafields`, {
      cookie,
    }),
  ]);

  return (
    <CustomerForm
      storeId={store.id}
      storeSlug={store.slug}
      customer={customer}
      definitions={definitions.data}
      metafields={metafields.data}
      readOnly={!can(store, "customers.write")}
    />
  );
}
