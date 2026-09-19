import type { PlatformMetrics } from "@ocean/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Overview · Ocean Platform Admin" };

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function OverviewPage() {
  await requirePlatformOperator("/overview");
  const { data: metrics } = await api<{ data: PlatformMetrics }>("/metrics", {
    cookie: await cookieHeader(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate counts across every organization and store — refreshed on every load.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Organizations" value={metrics.organizationCount} />
        <Stat label="Stores" value={metrics.storeCount} />
        <Stat label="Active subscriptions" value={metrics.activeSubscriptionCount} />
        <Stat label="Trialing" value={metrics.trialingSubscriptionCount} />
        <Stat label="Past due" value={metrics.pastDueSubscriptionCount} />
        <Stat label="Canceled" value={metrics.canceledSubscriptionCount} />
        <Stat label="Verified domains" value={metrics.verifiedDomainCount} />
        <Stat label="Pending domains" value={metrics.pendingDomainCount} />
        <Stat label="Failed domains" value={metrics.failedDomainCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions by plan</CardTitle>
          <CardDescription>Count of subscriptions currently on each plan.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {metrics.subscriptionsByPlan.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No subscriptions yet.</p>
          ) : (
            <ul className="divide-y">
              {metrics.subscriptionsByPlan.map((p) => (
                <li key={p.planId} className="flex items-center justify-between px-6 py-3 text-sm">
                  <span className="font-medium">{p.planName}</span>
                  <span className="text-muted-foreground">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
