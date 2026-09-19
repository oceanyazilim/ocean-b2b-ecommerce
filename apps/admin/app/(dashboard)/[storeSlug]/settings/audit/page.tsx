import type { AuditLogEntry, Paginated } from "@ocean/types";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@ocean/ui";
import Link from "next/link";
import { notFound } from "next/navigation";

import { api, API_URL } from "@/lib/api";
import { can, cookieHeader, findStore, requireMe } from "@/lib/session";

export const metadata = { title: "Audit log · Ocean Admin" };

const RESOURCE_TYPES = [
  "order",
  "product",
  "customer",
  "company",
  "custom_role",
  "developer_app",
  "api_key",
  "webhook",
  "impersonation_session",
];

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ cursor?: string; resourceType?: string }>;
}) {
  const { storeSlug } = await params;
  const { cursor, resourceType } = await searchParams;
  const me = await requireMe(`/${storeSlug}/settings/audit`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "settings.read")) {
    return <Alert variant="warning">Your role cannot view the audit log.</Alert>;
  }

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(resourceType ? { resourceType } : {}),
  });
  const page = await api<Paginated<AuditLogEntry>>(
    `/stores/${store.id}/audit-logs?${query.toString()}`,
    { cookie: await cookieHeader() },
  );
  const exportUrl = `${API_URL}/admin/v1/stores/${store.id}/audit-logs/export${resourceType ? `?resourceType=${encodeURIComponent(resourceType)}` : ""}`;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Who changed what in this store. Newest first.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <form method="GET" className="flex items-center gap-2">
            <select
              name="resourceType"
              defaultValue={resourceType ?? ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All resource types</option>
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="submit" className="text-sm font-medium hover:underline">
              Filter
            </button>
          </form>
          <a href={exportUrl} className="text-sm font-medium hover:underline">
            Export CSV
          </a>
        </div>
      </CardHeader>
      <CardContent className={page.data.length ? "p-0" : undefined}>
        {page.data.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Actions in this store will appear here."
          />
        ) : (
          <>
            <ul className="divide-y">
              {page.data.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  <Badge variant="outline" className="w-fit font-mono text-[11px]">
                    {e.action}
                  </Badge>
                  <span className="text-muted-foreground">
                    {e.actor ? e.actor.name : e.actorType}
                    {e.resourceId ? ` · ${e.resourceType} ${e.resourceId.slice(0, 8)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {page.pageInfo.hasNextPage && page.pageInfo.endCursor && (
              <div className="border-t px-6 py-3">
                <Link
                  href={`/${storeSlug}/settings/audit?cursor=${encodeURIComponent(page.pageInfo.endCursor)}${resourceType ? `&resourceType=${encodeURIComponent(resourceType)}` : ""}`}
                  className="text-sm font-medium hover:underline"
                >
                  Older entries →
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
