import { Alert } from "@ocean/ui";

import { can } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PricingShell } from "../pricing-shell";
import { PriceSimulator } from "./price-simulator";

export const metadata = { title: "Price simulator · Ocean Admin" };

export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/pricing/simulator");
  if (!can(store, "pricing.read"))
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  return (
    <PricingShell storeSlug={store.slug}>
      <PriceSimulator storeId={store.id} />
    </PricingShell>
  );
}
