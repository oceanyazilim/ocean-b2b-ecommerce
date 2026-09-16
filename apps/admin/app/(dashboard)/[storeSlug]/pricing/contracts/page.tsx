import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PricingShell } from "../pricing-shell";
import { ContractPrices } from "./contract-prices";

export const metadata = { title: "Contract prices · Ocean Admin" };

export default async function ContractPricesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/pricing/contracts");
  if (!can(store, "pricing.read"))
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  return (
    <PricingShell storeSlug={store.slug}>
      <ContractPrices
        storeId={store.id}
        storeSlug={store.slug}
        canWrite={can(store, "pricing.write")}
      />
    </PricingShell>
  );
}
