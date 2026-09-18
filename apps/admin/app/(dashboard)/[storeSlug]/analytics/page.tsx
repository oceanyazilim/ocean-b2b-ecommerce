import { notFound } from "next/navigation";

import { can, findStore, requireMe } from "@/lib/session";

import { AnalyticsDashboard } from "./analytics-dashboard";

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}/analytics`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;
  if (!can(store, "analytics.read")) notFound();

  return <AnalyticsDashboard storeId={store.id} currency={store.defaultCurrency} />;
}
