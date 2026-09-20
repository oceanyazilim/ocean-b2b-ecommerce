"use client";

import type { AuditLogEntry, Paginated } from "@ocean/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Input } from "@ocean/ui";
import Link from "next/link";
import { useMemo, useState } from "react";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(e: AuditLogEntry): string {
  return e.actor ? e.actor.name : e.actorType;
}

function resourceLabel(e: AuditLogEntry): string {
  if (!e.resourceId) return e.resourceType;
  return `${e.resourceType} · ${e.resourceId.slice(0, 8)}`;
}

// Restyled per the master spec's "Filters: User, Action, Date, Resource" — Resource and Date are
// real server-side filters (AuditController accepts resourceType/from/to and this page passes
// them through as query params, same as before). There is no actorId/action query param on the
// API today, so "User" and "Action" are a live client-side search across the currently loaded
// page (up to 50 rows) rather than a server-wide filter — it searches real data, just scoped to
// what's on screen, and is labelled as such below instead of pretending to be a full-log search.
export function ActivityLog({
  storeSlug,
  page,
  resourceTypes,
  resourceType,
  from,
  to,
  exportUrl,
}: {
  storeSlug: string;
  page: Paginated<AuditLogEntry>;
  resourceTypes: string[];
  resourceType: string;
  from: string;
  to: string;
  exportUrl: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return page.data;
    return page.data.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        actorLabel(e).toLowerCase().includes(q) ||
        (e.actor?.email.toLowerCase().includes(q) ?? false),
    );
  }, [page.data, search]);

  const base = `/${storeSlug}/settings/audit`;
  const nextHref = (() => {
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return null;
    const qs = new URLSearchParams({
      cursor: page.pageInfo.endCursor,
      ...(resourceType ? { resourceType } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    return `${base}?${qs.toString()}`;
  })();

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Activity log</CardTitle>
            <CardDescription>Who changed what in this store. Newest first.</CardDescription>
          </div>
          <a
            href={exportUrl}
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent"
          >
            Export CSV
          </a>
        </div>

        <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-resource" className="text-xs font-medium text-muted-foreground">
              Resource
            </label>
            <select
              id="filter-resource"
              name="resourceType"
              defaultValue={resourceType}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">All resource types</option>
              {resourceTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="filter-from"
              type="date"
              name="from"
              defaultValue={from}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="filter-to"
              type="date"
              name="to"
              defaultValue={to}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Apply
          </button>
          {(resourceType || from || to) && (
            <Link href={base} className="text-sm font-medium text-muted-foreground hover:underline">
              Clear
            </Link>
          )}
          <div className="ml-auto flex flex-col gap-1">
            <label htmlFor="filter-search" className="text-xs font-medium text-muted-foreground">
              Search user or action (this page)
            </label>
            <Input
              id="filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. jane@acme.com or orders.write"
              className="h-9 w-64"
            />
          </div>
        </form>
      </CardHeader>
      <CardContent className={filtered.length ? "p-0" : undefined}>
        {page.data.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            description="Actions in this store will appear here."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches on this page"
            description="Try clearing the search, or use Resource / From / To for a full server-side filter."
          />
        ) : (
          <>
            <ul className="divide-y">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-col gap-1 px-6 py-3 text-sm sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">
                    {formatWhen(e.createdAt)}
                  </span>
                  <Badge variant="outline" className="w-fit font-mono text-[11px]">
                    {e.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    <span className="font-medium text-foreground">{actorLabel(e)}</span>
                    {e.actor && <span> ({e.actor.email})</span>} · {resourceLabel(e)}
                  </span>
                  {e.ip && (
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.ip}</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t px-6 py-3 text-xs text-muted-foreground">
              <span>
                {filtered.length} of {page.data.length} shown
              </span>
              {nextHref && (
                <Link href={nextHref} className="text-sm font-medium text-foreground hover:underline">
                  Older entries →
                </Link>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
