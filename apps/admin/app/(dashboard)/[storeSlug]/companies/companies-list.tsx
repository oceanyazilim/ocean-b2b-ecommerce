"use client";

import type { CompanyStats, CompanyStatus, CompanySummary, Paginated } from "@ocean/types";
import { Alert, Badge, Button, DataGrid, Input, Tabs, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { CompaniesNav } from "./company-nav";

type View = "all" | CompanyStatus;
type Sort = "created_desc" | "created_asc" | "name_asc" | "name_desc";

export const COMPANY_STATUS_BADGE: Record<CompanyStatus, "success" | "warning" | "secondary"> = {
  active: "success",
  suspended: "warning",
  archived: "secondary",
};

export function CompaniesList({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  const [sort, setSort] = useState<Sort>("created_desc");
  const [pages, setPages] = useState<CompanySummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CompanyStats | null>(null);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25", sort });
        if (q.trim()) params.set("q", q.trim());
        if (view !== "all") params.set("status", view);
        if (after) params.set("cursor", after);
        const [res, s] = await Promise.all([
          api<Paginated<CompanySummary>>(`/stores/${storeId}/companies?${params}`),
          append ? null : api<{ data: CompanyStats }>(`/stores/${storeId}/companies/stats`),
        ]);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
        if (s) setStats(s.data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, q, view, sort],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);

  const rows = useMemo(() => pages.flat(), [pages]);

  const columns: DataGridColumn<CompanySummary>[] = [
    {
      key: "name",
      header: "Company",
      sortable: true,
      cell: (c) => (
        <div>
          <Link href={`/${storeSlug}/companies/${c.id}`} className="font-medium hover:underline">
            {c.displayName}
          </Link>
          <div className="text-xs text-muted-foreground">
            {c.legalName !== c.displayName ? c.legalName : (c.taxNumber ?? "—")}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <Badge variant={COMPANY_STATUS_BADGE[c.status]}>{c.status}</Badge>,
    },
    {
      key: "location",
      header: "Head office",
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.defaultLocation
            ? `${c.defaultLocation.city}, ${c.defaultLocation.countryCode}`
            : "No location"}
        </span>
      ),
    },
    {
      key: "counts",
      header: "Locations / Users",
      className: "text-right",
      cell: (c) => (
        <span className="tabular-nums">
          {c.locationCount} / {c.userCount}
        </span>
      ),
    },
    {
      key: "manager",
      header: "Account manager",
      cell: (c) => <span className="text-muted-foreground">{c.accountManager?.name ?? "—"}</span>,
    },
    { key: "currency", header: "Currency", cell: (c) => c.currency },
    {
      key: "created",
      header: "Added",
      sortable: true,
      cell: (c) => (
        <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  function onSortChange(key: string) {
    if (key === "name") setSort(sort === "name_asc" ? "name_desc" : "name_asc");
    else setSort(sort === "created_desc" ? "created_asc" : "created_desc");
  }
  const sortState =
    sort === "name_asc" || sort === "name_desc"
      ? { key: "name", direction: sort === "name_asc" ? ("asc" as const) : ("desc" as const) }
      : { key: "created", direction: sort === "created_asc" ? ("asc" as const) : ("desc" as const) };

  const filtered = q.trim() !== "" || view !== "all";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            B2B accounts with their locations, buyers and account managers.
          </p>
        </div>
        {canWrite && (
          <Link href={`/${storeSlug}/companies/new`}>
            <Button>Add company</Button>
          </Link>
        )}
      </div>

      <CompaniesNav storeSlug={storeSlug} pendingApplications={stats?.pendingApplications} />

      <Tabs
        aria-label="Filter by status"
        value={view}
        onChange={setView}
        items={[
          { value: "all", label: "All", count: stats?.total },
          { value: "active", label: "Active", count: stats?.active },
          { value: "suspended", label: "Suspended", count: stats?.suspended },
          { value: "archived", label: "Archived", count: stats?.archived },
        ]}
      />

      <Input
        placeholder="Search by name, tax number, external ID or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search companies"
      />

      {error && <Alert variant="error">{error}</Alert>}

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        sort={sortState}
        onSortChange={onSortChange}
        onRowClick={(c) => router.push(`/${storeSlug}/companies/${c.id}`)}
        empty={{
          title: filtered ? "No companies match" : "No companies yet",
          description: filtered
            ? "Try a different search or status."
            : "Create a company by hand or approve a wholesale application.",
          action:
            canWrite && !filtered ? (
              <Link href={`/${storeSlug}/companies/new`}>
                <Button>Add your first company</Button>
              </Link>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
    </div>
  );
}
