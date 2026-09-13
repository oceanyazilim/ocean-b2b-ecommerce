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

import { api } from "@/lib/api";
import { can, cookieHeader, findStore, requireMe } from "@/lib/session";

export const metadata = { title: "Audit log · Ocean Admin" };

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { storeSlug } = await params;
  const { cursor } = await searchParams;
  const me = await requireMe(`/${storeSlug}/settings/audit`);
  const found = findStore(me, storeSlug);
  if (!found) notFound();
  const { store } = found;

  if (!can(store, "settings.read")) {
    return <Alert variant="warning">Your role cannot view the audit log.</Alert>;
  }

  const query = new URLSearchParams({ limit: "50", ...(cursor ? { cursor } : {}) });
  const page = await api<Paginated<AuditLogEntry>>(
    `/stores/${store.id}/audit-logs?${query.toString()}`,
    { cookie: await cookieHeader() },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Who changed what in this store. Newest first.</CardDescription>
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
                  href={`/${storeSlug}/settings/audit?cursor=${encodeURIComponent(page.pageInfo.endCursor)}`}
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
