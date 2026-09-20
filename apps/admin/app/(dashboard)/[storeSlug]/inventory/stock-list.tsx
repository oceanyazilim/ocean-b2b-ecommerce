"use client";

import type {
  InventoryItemSummary,
  InventoryStats,
  InventoryStockStatus,
  LocationSummary,
  Paginated,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataGrid,
  Input,
  Select,
  Tabs,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { AddItemDialog } from "./add-item-dialog";
import { formatWhen, itemLabel, STOCK_STATUS } from "./format";
import { ItemDialog } from "./item-dialog";

type StatusFilter = "all" | InventoryStockStatus;

export function StockList({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [q, setQ] = useState("");
  // Supports a `?status=low` deep link (used by the dashboard's "needs attention" section) that
  // preselects the matching tab on load, same idea as the orders list's `?view=`.
  const [status, setStatus] = useState<StatusFilter>(() => {
    if (typeof window === "undefined") return "all";
    const fromUrl = new URLSearchParams(window.location.search).get("status");
    return fromUrl === "low" || fromUrl === "out_of_stock" || fromUrl === "in_stock"
      ? fromUrl
      : "all";
  });
  const [locationId, setLocationId] = useState("");
  const [rows, setRows] = useState<InventoryItemSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    Promise.all([
      api<{ data: LocationSummary[] }>(`/stores/${storeId}/locations`),
      api<{ data: InventoryStats }>(`/stores/${storeId}/inventory/stats`),
    ])
      .then(([l, s]) => {
        setLocations(l.data);
        setStats(s.data);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [storeId, refreshKey]);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (status !== "all") params.set("status", status);
        if (locationId) params.set("locationId", locationId);
        if (after) params.set("cursor", after);
        const res = await api<Paginated<InventoryItemSummary>>(
          `/stores/${storeId}/inventory/items?${params}`,
        );
        setRows((prev) => (append ? [...prev, ...res.data] : res.data));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, q, status, locationId],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const activeLocations = locations.filter((l) => l.isActive);

  const columns: DataGridColumn<InventoryItemSummary>[] = [
    {
      key: "product",
      header: "Product",
      cell: (i) => (
        <div className="flex items-center gap-3">
          {i.variant?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={i.variant.image.url}
              alt={i.variant.image.alt ?? ""}
              className="h-9 w-9 rounded border object-cover"
            />
          ) : (
            <div className="h-9 w-9 rounded border bg-muted" aria-hidden />
          )}
          <div className="min-w-0 truncate font-medium">{i.variant?.productTitle ?? itemLabel(i)}</div>
        </div>
      ),
    },
    {
      key: "variant",
      header: "Variant",
      cell: (i) => (
        <span className="text-muted-foreground">
          {i.variant && i.variant.title !== "Default Title" ? i.variant.title : "—"}
        </span>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      cell: (i) => (
        <span className="text-muted-foreground">
          {i.sku ?? (i.upc ? `UPC ${i.upc}` : "—")}
        </span>
      ),
    },
    {
      key: "committed",
      header: "Committed",
      className: "text-right",
      cell: (i) => <span className="tabular-nums text-muted-foreground">{i.committed}</span>,
    },
    {
      key: "available",
      header: "Available",
      className: "text-right",
      cell: (i) => <span className="font-semibold tabular-nums">{i.available}</span>,
    },
    {
      key: "incoming",
      header: (
        <span title="Not tracked — this system has no purchase-order module yet">Incoming</span>
      ),
      className: "text-right",
      // No purchase-order system exists anywhere in this codebase, so there is no real quantity
      // to show here. Rendered as an explicit "not tracked" dash rather than a fabricated 0/blank.
      cell: () => (
        <span
          className="text-muted-foreground/60"
          title="Not tracked — this system has no purchase-order module yet"
        >
          —
        </span>
      ),
    },
    {
      key: "onHand",
      header: "On hand",
      className: "text-right",
      cell: (i) => <span className="tabular-nums">{i.onHand}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (i) => (
        <Badge variant={STOCK_STATUS[i.stockStatus].variant}>
          {STOCK_STATUS[i.stockStatus].label}
        </Badge>
      ),
    },
    {
      key: "moved",
      header: "Last moved",
      cell: (i) => <span className="text-muted-foreground">{formatWhen(i.lastMovedAt)}</span>,
    },
  ];

  const statCards: { label: string; value: number | string; hint?: string }[] = [
    { label: "Tracked items", value: stats?.itemCount ?? "—" },
    { label: "Units on hand", value: stats?.totalOnHand ?? "—" },
    { label: "Low stock", value: stats?.lowStock ?? "—" },
    { label: "Out of stock", value: stats?.outOfStock ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {locations.length === 0 && !error && (
        <Alert variant="info" title="No locations yet">
          Stock lives at a location.{" "}
          <Link href={`/${storeSlug}/inventory/locations`} className="underline">
            Create your first location
          </Link>{" "}
          before tracking items.
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<StatusFilter>
          aria-label="Stock status"
          value={status}
          onChange={setStatus}
          items={[
            { value: "all", label: "All", count: stats?.itemCount },
            { value: "in_stock", label: "In stock" },
            { value: "low", label: "Low", count: stats?.lowStock },
            { value: "out_of_stock", label: "Out of stock", count: stats?.outOfStock },
          ]}
        />
        {canWrite && (
          <Button onClick={() => setAdding(true)} disabled={locations.length === 0}>
            Track item
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by SKU, UPC or product"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
          aria-label="Search inventory"
        />
        <Select
          aria-label="Filter by warehouse or location"
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          className="w-full max-w-xs"
        >
          <option value="">All warehouses / locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        &ldquo;Incoming&rdquo; is not shown as a number: this system has no purchase-order module,
        so there is no real incoming-stock quantity to report yet.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        loading={loading}
        onRowClick={(i) => setSelected(i.id)}
        empty={{
          title: q || status !== "all" || locationId ? "No items match" : "Nothing tracked yet",
          description:
            q || status !== "all" || locationId
              ? "Try a different search or filter."
              : "Track a product variant or a bare SKU to start counting stock.",
          action:
            canWrite && !q && status === "all" && !locationId && locations.length > 0 ? (
              <Button onClick={() => setAdding(true)}>Track your first item</Button>
            ) : undefined,
        }}
        pageInfo={{ hasNextPage: hasNext, onNext: () => void load(cursor, true) }}
      />

      <ItemDialog
        storeId={storeId}
        itemId={selected}
        locations={activeLocations}
        canWrite={canWrite}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
      <AddItemDialog
        storeId={storeId}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          refresh();
          setSelected(id);
        }}
      />
    </div>
  );
}
