"use client";

import type {
  CompanySummary,
  CustomerKind,
  CustomerStats,
  CustomerSummary,
  Paginated,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Tabs,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

type View = "all" | "individual" | "company_buyer" | "disabled";
type Sort = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "spent_desc";

export function CustomersList({
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
  const [companyId, setCompanyId] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [pages, setPages] = useState<CustomerSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagDialog, setTagDialog] = useState<"add_tag" | "remove_tag" | null>(null);
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  // Companies back the real companyId filter (B2B buyers belong to a company); display-only, so
  // a role without companies.read just sees the filter stay empty.
  useEffect(() => {
    api<Paginated<CompanySummary>>(`/stores/${storeId}/companies?limit=100`)
      .then((res) => setCompanies(res.data))
      .catch(() => setCompanies([]));
  }, [storeId]);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25", sort });
        if (q.trim()) params.set("q", q.trim());
        if (view === "disabled") params.set("status", "disabled");
        else if (view !== "all") params.set("kind", view satisfies CustomerKind);
        if (companyId) params.set("companyId", companyId);
        if (tagFilter.trim()) params.set("tag", tagFilter.trim());
        if (after) params.set("cursor", after);
        const [res, s] = await Promise.all([
          api<Paginated<CustomerSummary>>(`/stores/${storeId}/customers?${params}`),
          append ? null : api<{ data: CustomerStats }>(`/stores/${storeId}/customers/stats`),
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
    [storeId, q, view, companyId, tagFilter, sort],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q || tagFilter ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q, tagFilter]);

  const rows = useMemo(() => pages.flat(), [pages]);
  const filtersActive = !!companyId || !!tagFilter.trim();

  async function bulk(action: "add_tag" | "remove_tag" | "disable" | "enable" | "delete") {
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${storeId}/customers/bulk`, {
        body: { ids: [...selected], action, ...(action.endsWith("_tag") ? { tag } : {}) },
      });
      setSelected(new Set());
      setConfirmDelete(false);
      setTagDialog(null);
      setTag("");
      await load(null, false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataGridColumn<CustomerSummary>[] = [
    {
      key: "name",
      header: "Customer",
      sortable: true,
      cell: (c) => (
        <div>
          <Link href={`/${storeSlug}/customers/${c.id}`} className="font-medium hover:underline">
            {c.displayName}
          </Link>
          <div className="text-xs text-muted-foreground">{c.email}</div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Type",
      cell: (c) =>
        c.kind === "company_buyer" ? (
          <Badge>Company buyer{c.companyCount > 1 ? ` · ${c.companyCount}` : ""}</Badge>
        ) : (
          <span className="text-muted-foreground">Individual</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={c.status === "active" ? "success" : "secondary"}>{c.status}</Badge>
          {c.emailMarketing === "subscribed" && <Badge variant="secondary">Subscribed</Badge>}
          {c.taxExempt && <Badge variant="warning">Tax exempt</Badge>}
        </div>
      ),
    },
    {
      key: "tags",
      header: "Tags",
      cell: (c) =>
        c.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {c.tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
            {c.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{c.tags.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "location",
      header: "Location",
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.defaultAddress
            ? [c.defaultAddress.city, c.defaultAddress.countryCode].filter(Boolean).join(", ")
            : "—"}
        </span>
      ),
    },
    {
      key: "orders",
      header: "Orders",
      className: "text-right",
      cell: (c) => <span className="tabular-nums">{c.ordersCount}</span>,
    },
    {
      key: "spent",
      header: "Lifetime value",
      sortable: true,
      className: "text-right",
      cell: (c) => <span className="tabular-nums">{formatMoney(c.totalSpent)}</span>,
    },
    {
      key: "lastOrder",
      header: "Last order",
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
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
    else if (key === "spent") setSort("spent_desc");
    else setSort(sort === "created_desc" ? "created_asc" : "created_desc");
  }
  const sortState =
    sort === "name_asc" || sort === "name_desc"
      ? { key: "name", direction: sort === "name_asc" ? ("asc" as const) : ("desc" as const) }
      : sort === "spent_desc"
        ? { key: "spent", direction: "desc" as const }
        : {
            key: "created",
            direction: sort === "created_asc" ? ("asc" as const) : ("desc" as const),
          };

  const filtered = q.trim() !== "" || view !== "all" || filtersActive;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Shoppers and company buyers, their addresses, tags and marketing consent.
          </p>
        </div>
        {canWrite && (
          <Link href={`/${storeSlug}/customers/new`}>
            <Button>Add customer</Button>
          </Link>
        )}
      </div>

      <Tabs
        aria-label="Filter customers"
        value={view}
        onChange={(v) => {
          setView(v);
          setSelected(new Set());
        }}
        items={[
          { value: "all", label: "All", count: stats?.total },
          { value: "individual", label: "Individuals" },
          { value: "company_buyer", label: "Company buyers", count: stats?.companyBuyers },
          { value: "disabled", label: "Disabled", count: stats?.disabled },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by name, email, phone or tag"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
          aria-label="Search customers"
        />
        <Select
          aria-label="Filter by company"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-auto max-w-[220px]"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Filter by tag"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="w-auto max-w-[180px]"
          aria-label="Filter by tag"
        />
        {(filtersActive || q) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setCompanyId("");
              setTagFilter("");
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        selectable={canWrite}
        selected={selected}
        onSelectedChange={setSelected}
        sort={sortState}
        onSortChange={onSortChange}
        onRowClick={(c) => router.push(`/${storeSlug}/customers/${c.id}`)}
        bulkActions={
          <>
            <Button size="sm" variant="outline" onClick={() => setTagDialog("add_tag")}>
              Add tag
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTagDialog("remove_tag")}>
              Remove tag
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => bulk("disable")}>
              Disable
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => bulk("enable")}>
              Enable
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          </>
        }
        empty={{
          title: filtered ? "No customers match" : "No customers yet",
          description: filtered
            ? "Try a different search or filter."
            : "Add a customer by hand, or wait for the first storefront sign-up.",
          action:
            canWrite && !filtered ? (
              <Link href={`/${storeSlug}/customers/new`}>
                <Button>Add your first customer</Button>
              </Link>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />

      <Dialog
        open={tagDialog !== null}
        onClose={() => setTagDialog(null)}
        title={tagDialog === "add_tag" ? "Add a tag" : "Remove a tag"}
        description={`Applies to ${selected.size} selected customer${selected.size === 1 ? "" : "s"}.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTagDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!tag.trim()}
              onClick={() => tagDialog && void bulk(tagDialog)}
            >
              Apply
            </Button>
          </>
        }
      >
        <FormField id="bulk-tag" label="Tag">
          <Input
            id="bulk-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            maxLength={40}
          />
        </FormField>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => bulk("delete")}
        title={`Delete ${selected.size} customer${selected.size === 1 ? "" : "s"}?`}
        description="Deleted customers lose their company memberships and disappear from lists. Order history is kept."
        confirmLabel="Delete"
        destructive
        pending={busy}
      />
    </div>
  );
}
