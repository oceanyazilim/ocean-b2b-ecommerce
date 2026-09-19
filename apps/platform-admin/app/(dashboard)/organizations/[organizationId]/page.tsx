import type { PlatformInvoiceSummary, PlatformOrganizationDetail } from "@ocean/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { api, isApiError } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Organization · Ocean Platform Admin" };

function money(amount: { amount: number; currency: string }): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: amount.currency }).format(
    amount.amount / 100,
  );
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await requirePlatformOperator(`/organizations/${organizationId}`);
  const cookie = await cookieHeader();

  let org: PlatformOrganizationDetail;
  try {
    const res = await api<{ data: PlatformOrganizationDetail }>(`/organizations/${organizationId}`, {
      cookie,
    });
    org = res.data;
  } catch (error) {
    if (isApiError(error, "not_found")) notFound();
    throw error;
  }

  const { data: invoices } = await api<{ data: PlatformInvoiceSummary[] }>(
    `/organizations/${organizationId}/billing/invoices`,
    { cookie },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
            <Badge variant={org.status === "active" ? "success" : "secondary"}>{org.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {org.slug} · created {new Date(org.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Link href="/organizations" className="text-sm font-medium hover:underline">
          ← All organizations
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stores ({org.stores.length})</CardTitle>
            <CardDescription>Every store owned by this organization.</CardDescription>
          </CardHeader>
          <CardContent className={org.stores.length ? "p-0" : undefined}>
            {org.stores.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No stores yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-6 py-2.5">Store</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Staff</th>
                    <th className="px-4 py-2.5">Domains</th>
                    <th className="px-4 py-2.5">Currency</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {org.stores.map((s) => (
                    <tr key={s.id}>
                      <td className="px-6 py-3">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.status}</td>
                      <td className="px-4 py-3 tabular-nums">{s.staffCount}</td>
                      <td className="px-4 py-3 tabular-nums">{s.domainCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.defaultCurrency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <CardDescription>Read-only — plan changes stay in the merchant admin.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {org.subscription ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{org.subscription.plan.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={org.subscription.status === "active" ? "success" : "secondary"}>
                    {org.subscription.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current period ends</span>
                  <span>{new Date(org.subscription.currentPeriodEnd).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Stores used</span>
                  <span>
                    {org.subscription.usage.storesUsed}
                    {org.subscription.usage.storesMax !== null ? ` / ${org.subscription.usage.storesMax}` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Staff used</span>
                  <span>
                    {org.subscription.usage.staffUsed}
                    {org.subscription.usage.staffMax !== null ? ` / ${org.subscription.usage.staffMax}` : ""}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No subscription on record.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Ocean billing this organization for its subscription.</CardDescription>
        </CardHeader>
        <CardContent className={invoices.length ? "p-0" : undefined}>
          {invoices.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2.5">Amount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-3 font-medium">{money(inv.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.status === "paid" ? "success" : "secondary"}>{inv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.dueAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
