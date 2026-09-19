import type { Paginated, PlatformStoreSummary } from "@ocean/types";
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Stores · Ocean Platform Admin" };

export default async function StoresPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string }>;
}) {
  await requirePlatformOperator("/stores");
  const { cursor, q } = await searchParams;

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(q ? { q } : {}),
  });
  const stores = await api<Paginated<PlatformStoreSummary>>(`/stores?${query.toString()}`, {
    cookie: await cookieHeader(),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Stores</CardTitle>
          <p className="text-sm text-muted-foreground">Every store across every tenant.</p>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search name or slug…"
            defaultValue={q ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button type="submit" className="text-sm font-medium hover:underline">
            Filter
          </button>
        </form>
      </CardHeader>
      <CardContent className={stores.data.length ? "p-0" : undefined}>
        {stores.data.length === 0 ? (
          <EmptyState title="No stores found" description="Try a different search." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Staff</th>
                  <th className="px-4 py-2.5">Domains</th>
                  <th className="px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stores.data.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/60">
                    <td className="px-6 py-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/organizations/${s.organizationId}`} className="hover:underline">
                        {s.organizationName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.status}</td>
                    <td className="px-4 py-3 tabular-nums">{s.staffCount}</td>
                    <td className="px-4 py-3 tabular-nums">{s.domainCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stores.pageInfo.hasNextPage && stores.pageInfo.endCursor && (
              <div className="border-t px-6 py-3">
                <Link
                  href={`/stores?${new URLSearchParams({ ...(q ? { q } : {}), cursor: stores.pageInfo.endCursor }).toString()}`}
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
