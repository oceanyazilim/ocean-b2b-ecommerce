import type {
  CollectionSummary,
  Paginated,
  PriceListSummary,
  VolumeRuleSummary,
} from "@ocean/types";
import { Alert } from "@ocean/ui";

import { api } from "@/lib/api";
import { can, cookieHeader } from "@/lib/session";
import { loadStorePage } from "@/lib/store-page";

import { PricingShell } from "../pricing-shell";
import { VolumeRules } from "./volume-rules";

export const metadata = { title: "Volume pricing · Ocean Admin" };

export default async function VolumePricingPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const { store } = await loadStorePage(storeSlug, "/pricing/volume");
  if (!can(store, "pricing.read"))
    return <Alert variant="warning">Your role cannot view pricing.</Alert>;
  const cookie = await cookieHeader();
  const [rules, priceLists, collections] = await Promise.all([
    api<{ data: VolumeRuleSummary[] }>(`/stores/${store.id}/pricing/volume-rules`, { cookie }),
    api<Paginated<PriceListSummary>>(`/stores/${store.id}/price-lists?limit=250`, { cookie }),
    api<Paginated<CollectionSummary>>(`/stores/${store.id}/collections?limit=250`, { cookie }),
  ]);
  return (
    <PricingShell storeSlug={store.slug}>
      <VolumeRules
        storeId={store.id}
        currency={store.defaultCurrency}
        rules={rules.data}
        priceLists={priceLists.data.map((p) => ({ id: p.id, name: p.name }))}
        collections={collections.data.map((c) => ({ id: c.id, title: c.title }))}
        canWrite={can(store, "pricing.write")}
      />
    </PricingShell>
  );
}
