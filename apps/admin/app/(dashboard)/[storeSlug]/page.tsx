import { notFound } from "next/navigation";

import { can, findStore, requireMe } from "@/lib/session";

import { DashboardView } from "./dashboard-view";
import { OnboardingChecklist } from "./onboarding-checklist";

export default async function StoreHomePage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const me = await requireMe(`/${storeSlug}`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  return (
    <div className="flex flex-col gap-8">
      <DashboardView
        storeId={store.id}
        storeSlug={store.slug}
        storeName={store.name}
        currency={store.defaultCurrency}
        userName={me.user.name}
        permissions={{
          orders: can(store, "orders.read"),
          analytics: can(store, "analytics.read"),
          inventory: can(store, "inventory.read"),
          companies: can(store, "companies.read"),
          quotes: can(store, "quotes.read"),
          taxes: can(store, "taxes.read"),
        }}
      />
      <OnboardingChecklist
        storeId={store.id}
        storeSlug={store.slug}
        state={store.onboardingState}
        editable={can(store, "settings.write")}
      />
    </div>
  );
}
