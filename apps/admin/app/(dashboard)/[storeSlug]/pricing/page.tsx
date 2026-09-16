import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PriceListsList } from "./price-lists-list";
import { PricingShell } from "./pricing-shell";

export const metadata = { title: "Price lists · Ocean Admin" };

export default async function PricingPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/pricing");
  if (!can(store, "pricing.read")) {
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  }
  return (
    <PricingShell storeSlug={store.slug}>
      <PriceListsList
        storeId={store.id}
        storeSlug={store.slug}
        currency={store.defaultCurrency}
        canWrite={can(store, "pricing.write")}
      />
    </PricingShell>
  );
}
