import type { Paginated, PlatformOrganizationSummary } from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Organizations · Ocean Platform Admin" };

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; status?: string }>;
}) {
  await requirePlatformOperator("/organizations");
  const { cursor, q, status } = await searchParams;

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });
  const orgs = await api<Paginated<PlatformOrganizationSummary>>(
    `/organizations?${query.toString()}`,
    { cookie: await cookieHeader() },
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Organizations</CardTitle>
          <p className="text-sm text-muted-foreground">Every organization across every tenant.</p>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search name or slug…"
            defaultValue={q ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <button type="submit" className="text-sm font-medium hover:underline">
            Filter
          </button>
        </form>
      </CardHeader>
      <CardContent className={orgs.data.length ? "p-0" : undefined}>
        {orgs.data.length === 0 ? (
          <EmptyState title="No organizations found" description="Try a different search." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5">Stores</th>
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orgs.data.map((org) => (
                  <tr key={org.id} className="hover:bg-muted/60">
                    <td className="px-6 py-3">
                      <Link href={`/organizations/${org.id}`} className="font-medium hover:underline">
                        {org.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{org.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={org.status === "active" ? "success" : "secondary"}>
                        {org.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {org.planName ?? "—"}
                      {org.subscriptionStatus ? (
                        <span className="ml-1 text-xs">({org.subscriptionStatus})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{org.storeCount}</td>
                    <td className="px-4 py-3 tabular-nums">{org.staffCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orgs.pageInfo.hasNextPage && orgs.pageInfo.endCursor && (
              <div className="border-t px-6 py-3">
                <Link
                  href={`/organizations?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), cursor: orgs.pageInfo.endCursor }).toString()}`}
                  className="text-sm font-medium hover:underline"
                >
                  Next page →
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
