import type { Paginated, PlatformDomainSummary } from "@ocean/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Domains · Ocean Platform Admin" };

const STATUS_VARIANT: Record<string, "success" | "secondary" | "destructive"> = {
  verified: "success",
  pending: "secondary",
  failed: "destructive",
};

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; q?: string; status?: string }>;
}) {
  await requirePlatformOperator("/domains");
  const { cursor, q, status } = await searchParams;

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
  });
  const domains = await api<Paginated<PlatformDomainSummary>>(`/domains?${query.toString()}`, {
    cookie: await cookieHeader(),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Domains</CardTitle>
          <p className="text-sm text-muted-foreground">Every domain across every store.</p>
        </div>
        <form method="GET" className="flex items-center gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search hostname…"
            defaultValue={q ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </select>
          <button type="submit" className="text-sm font-medium hover:underline">
            Filter
          </button>
        </form>
      </CardHeader>
      <CardContent className={domains.data.length ? "p-0" : undefined}>
        {domains.data.length === 0 ? (
          <EmptyState title="No domains found" description="Try a different search." />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-2.5">Hostname</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">SSL</th>
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {domains.data.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/60">
                    <td className="px-6 py-3">
                      <span className="font-medium">{d.hostname}</span>
                      {d.isPrimary && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          primary
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[d.status] ?? "secondary"}>{d.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{d.sslStatus}</td>
                    <td className="px-4 py-3">{d.storeName}</td>
                    <td className="px-4 py-3">
                      <Link href={`/organizations/${d.organizationId}`} className="hover:underline">
                        {d.organizationName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {d.verifiedAt ? new Date(d.verifiedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {domains.pageInfo.hasNextPage && domains.pageInfo.endCursor && (
              <div className="border-t px-6 py-3">
                <Link
                  href={`/domains?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), cursor: domains.pageInfo.endCursor }).toString()}`}
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
