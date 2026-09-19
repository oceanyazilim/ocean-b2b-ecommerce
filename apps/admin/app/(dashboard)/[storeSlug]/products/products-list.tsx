"use client";

import type { CollectionSummary, Paginated, ProductStatus, ProductSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataGrid,
  Input,
  Select,
  Tabs,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, API_URL, errorMessage, parseExportError } from "@/lib/api";
import { formatMoney } from "@/lib/money";

type StatusTab = "all" | ProductStatus;
type Sort = "created_desc" | "created_asc" | "updated_desc" | "title_asc" | "title_desc";

const STATUS_BADGE: Record<ProductStatus, "success" | "secondary" | "warning"> = {
  active: "success",
  draft: "secondary",
  archived: "warning",
};

export function ProductsList({
  storeId,
  storeSlug,
  canWrite,
  canDelete,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusTab>("all");
  const [sort, setSort] = useState<Sort>("created_desc");
  const [collectionId, setCollectionId] = useState("");
  const [tag, setTag] = useState("");
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [pages, setPages] = useState<ProductSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Collections back a real filter (the API's collectionId param); this is display-only, so a
  // role without collections.read just sees the filter stay empty instead of erroring the page.
  useEffect(() => {
    api<Paginated<CollectionSummary>>(`/stores/${storeId}/collections?limit=100`)
      .then((res) => setCollections(res.data))
      .catch(() => setCollections([]));
  }, [storeId]);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25", sort });
        if (q.trim()) params.set("q", q.trim());
        if (status !== "all") params.set("status", status);
        if (collectionId) params.set("collectionId", collectionId);
        if (tag.trim()) params.set("tag", tag.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<ProductSummary>>(`/stores/${storeId}/products?${params}`);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, q, status, collectionId, tag, sort],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q || tag ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q, tag]);

  const rows = useMemo(() => pages.flat(), [pages]);
  const filtersActive = !!collectionId || !!tag.trim();

  async function bulk(action: "archive" | "unarchive" | "delete") {
    setBusy(true);
    setError(null);
    try {
      await api(`/stores/${storeId}/products/bulk`, { body: { ids: [...selected], action } });
      setSelected(new Set());
      setConfirmDelete(false);
      await load(null, false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/admin/v1/stores/${storeId}/products/export`, {
        credentials: "include",
      });
      const text = await res.text();
      if (!res.ok) {
        // The body is the JSON error envelope, not CSV — surface it instead of downloading a
        // file named "products.csv" that's actually an error message.
        setError(parseExportError(text));
        return;
      }
      const blob = new Blob([text], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const columns: DataGridColumn<ProductSummary>[] = [
    {
      key: "title",
      header: "Product",
      sortable: true,
      cell: (p) => (
        <div className="flex items-center gap-3">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.image.url}
              alt={p.image.alt ?? ""}
              className="h-9 w-9 rounded border object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded border bg-muted" aria-hidden />
          )}
          <div>
            <Link href={`/${storeSlug}/products/${p.id}`} className="font-medium hover:underline">
              {p.title}
            </Link>
            <div className="text-xs text-muted-foreground">
              {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>,
    },
    {
      key: "vendor",
      header: "Vendor",
      cell: (p) => <span className="text-muted-foreground">{p.vendor ?? "—"}</span>,
    },
    {
      key: "type",
      header: "Type",
      cell: (p) => <span className="text-muted-foreground">{p.productType ?? "—"}</span>,
    },
    {
      key: "price",
      header: "Price",
      cell: (p) =>
        p.priceRange
          ? p.priceRange.min.amount === p.priceRange.max.amount
            ? formatMoney(p.priceRange.min)
            : `${formatMoney(p.priceRange.min)} – ${formatMoney(p.priceRange.max)}`
          : "—",
    },
    {
      key: "updated",
      header: "Updated",
      sortable: true,
      cell: (p) => (
        <span className="text-muted-foreground">{new Date(p.updatedAt).toLocaleDateString()}</span>
      ),
    },
  ];

  function onSortChange(key: string) {
    if (key === "title") setSort(sort === "title_asc" ? "title_desc" : "title_asc");
    else if (key === "updated") setSort("updated_desc");
    else setSort(sort === "created_desc" ? "created_asc" : "created_desc");
  }
  const sortState =
    sort === "title_asc" || sort === "title_desc"
      ? { key: "title", direction: sort === "title_asc" ? ("asc" as const) : ("desc" as const) }
      : sort === "updated_desc"
        ? { key: "updated", direction: "desc" as const }
        : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Everything you sell, with variants, media and pricing.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void exportCsv()} loading={exporting}>
            Export CSV
          </Button>
          {canWrite && (
            <Link href={`/${storeSlug}/products/new`}>
              <Button>Add product</Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        aria-label="Filter by status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setSelected(new Set());
        }}
        items={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
          { value: "archived", label: "Archived" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by title, vendor, type or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
          aria-label="Search products"
        />
        <Select
          aria-label="Filter by collection"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="w-auto max-w-[220px]"
        >
          <option value="">All collections</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Filter by tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
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
              setCollectionId("");
              setTag("");
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
        rowKey={(p) => p.id}
        loading={loading}
        selectable={canWrite}
        selected={selected}
        onSelectedChange={setSelected}
        sort={sortState}
        onSortChange={onSortChange}
        onRowClick={(p) => router.push(`/${storeSlug}/products/${p.id}`)}
        bulkActions={
          <>
            <Button size="sm" variant="outline" loading={busy} onClick={() => bulk("archive")}>
              Archive
            </Button>
            <Button size="sm" variant="outline" loading={busy} onClick={() => bulk("unarchive")}>
              Set as draft
            </Button>
            {canDelete && (
              <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </>
        }
        empty={{
          title:
            q || status !== "all" || filtersActive ? "No products match" : "No products yet",
          description:
            q || status !== "all" || filtersActive
              ? "Try a different search, status or filter."
              : "Add your first product to start building your catalog.",
          action:
            canWrite && !q && status === "all" && !filtersActive ? (
              <Link href={`/${storeSlug}/products/new`}>
                <Button>Add your first product</Button>
              </Link>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => bulk("delete")}
        title={`Delete ${selected.size} product${selected.size === 1 ? "" : "s"}?`}
        description="Deleted products disappear from the catalog and all collections. This cannot be undone."
        confirmLabel="Delete"
        destructive
        pending={busy}
      />
    </div>
  );
}
