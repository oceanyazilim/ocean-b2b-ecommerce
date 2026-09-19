import type { Paginated, PlatformAuditLogEntry } from "@ocean/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@ocean/ui";
import Link from "next/link";

import { api } from "@/lib/api";
import { cookieHeader, requirePlatformOperator } from "@/lib/session";

export const metadata = { title: "Audit log · Ocean Platform Admin" };

// Mirrors apps/admin's per-store audit log (Phase 16) — same cursor pagination, same GET-form
// filter pattern — but with no store/organization scoping baked in: the filters here are
// optional narrowing, not a tenant boundary.
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    resourceType?: string;
    action?: string;
    organizationId?: string;
    storeId?: string;
  }>;
}) {
  await requirePlatformOperator("/audit");
  const { cursor, resourceType, action, organizationId, storeId } = await searchParams;

  const query = new URLSearchParams({
    limit: "50",
    ...(cursor ? { cursor } : {}),
    ...(resourceType ? { resourceType } : {}),
    ...(action ? { action } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(storeId ? { storeId } : {}),
  });
  const page = await api<Paginated<PlatformAuditLogEntry>>(`/audit?${query.toString()}`, {
    cookie: await cookieHeader(),
  });

  const carryOver = { resourceType, action, organizationId, storeId };
  const carryOverParams = Object.fromEntries(
    Object.entries(carryOver).filter(([, v]) => Boolean(v)),
  ) as Record<string, string>;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div>
          <CardTitle>Platform-wide audit log</CardTitle>
          <CardDescription>
            Every recorded action across every organization and store. Newest first.
          </CardDescription>
        </div>
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            name="resourceType"
            placeholder="Resource type"
            defaultValue={resourceType ?? ""}
            className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
          />
          <input
            type="text"
            name="action"
            placeholder="Action"
            defaultValue={action ?? ""}
            className="h-9 w-40 rounded-md border border-input bg-background px-2 text-sm"
          />
          <input
            type="text"
            name="organizationId"
            placeholder="Organization ID"
            defaultValue={organizationId ?? ""}
            className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm font-mono text-xs"
          />
          <input
            type="text"
            name="storeId"
            placeholder="Store ID"
            defaultValue={storeId ?? ""}
            className="h-9 w-52 rounded-md border border-input bg-background px-2 text-sm font-mono text-xs"
          />
          <button type="submit" className="text-sm font-medium hover:underline">
            Filter
          </button>
        </form>
      </CardHeader>
      <CardContent className={page.data.length ? "p-0" : undefined}>
        {page.data.length === 0 ? (
          <EmptyState title="Nothing recorded yet" description="Actions will appear here." />
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
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {e.actor ? `${e.actor.name} (${e.actorType})` : e.actorType}
                    {e.resourceId ? ` · ${e.resourceType} ${e.resourceId.slice(0, 8)}` : ""}
                    {e.organizationName ? (
                      <>
                        {" · "}
                        <Link href={`/organizations/${e.organizationId}`} className="hover:underline">
                          {e.organizationName}
                        </Link>
                      </>
                    ) : (
                      ""
                    )}
                    {e.storeName ? ` / ${e.storeName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {page.pageInfo.hasNextPage && page.pageInfo.endCursor && (
              <div className="border-t px-6 py-3">
                <Link
                  href={`/audit?${new URLSearchParams({ ...carryOverParams, cursor: page.pageInfo.endCursor }).toString()}`}
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
