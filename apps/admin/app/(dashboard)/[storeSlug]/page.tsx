import type { OrderStats } from "@ocean/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { api } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { can, cookieHeader, findStore, requireMe } from "@/lib/session";

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

  let stats: OrderStats | null = null;
  if (can(store, "orders.read")) {
    try {
      stats = (
        await api<{ data: OrderStats }>(`/stores/${store.id}/orders/stats`, {
          cookie: await cookieHeader(),
        })
      ).data;
    } catch {
      stats = null;
    }
  }

  const metrics = [
    {
      label: "Gross sales, last 30 days",
      value: stats ? formatMoney(stats.grossSalesLast30Days) : "—",
      hint: stats ? `${stats.ordersLast30Days} orders` : "Needs orders access",
    },
    {
      label: "Average order value",
      value: stats ? formatMoney(stats.averageOrderValueLast30Days) : "—",
      hint: "Last 30 days, cancelled orders excluded",
    },
    {
      label: "Open orders",
      value: stats ? String(stats.openOrders) : "—",
      hint: stats ? `${stats.awaitingPayment} awaiting payment` : "",
    },
    {
      label: "Outstanding receivables",
      value: "—",
      hint: "Available with invoices and payment terms (Phase 12).",
    },
  ];

  const ops = stats
    ? [
        { label: "Orders to fulfill", value: stats.toFulfill, href: `/${store.slug}/orders` },
        { label: "Awaiting payment", value: stats.awaitingPayment, href: `/${store.slug}/orders` },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{store.name}</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back, {me.user.name.split(" ")[0]}. Here is where your store stands today.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="pb-2">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{m.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{m.hint}</CardContent>
          </Card>
        ))}
      </div>

      {ops.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ops.map((o) => (
            <Link key={o.label} href={o.href}>
              <Card className="transition-colors hover:bg-accent">
                <CardHeader className="pb-2">
                  <CardDescription>{o.label}</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{o.value}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <OnboardingChecklist
        storeId={store.id}
        storeSlug={store.slug}
        state={store.onboardingState}
        editable={can(store, "settings.write")}
      />
    </div>
  );
}
