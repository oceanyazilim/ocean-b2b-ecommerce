import type { QuantityRuleSummary } from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PricingShell } from "../pricing-shell";
import { QuantityRules } from "./quantity-rules";

export const metadata = { title: "Quantity rules · Ocean Admin" };

export default async function QuantityRulesPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/pricing/quantity");
  if (!can(store, "pricing.read"))
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  const rules = await api<{ data: QuantityRuleSummary[] }>(
    `/stores/${store.id}/pricing/quantity-rules`,
    { cookie: await cookieHeader() },
  );
  return (
    <PricingShell storeSlug={store.slug}>
      <QuantityRules storeId={store.id} rules={rules.data} canWrite={can(store, "pricing.write")} />
    </PricingShell>
  );
}
