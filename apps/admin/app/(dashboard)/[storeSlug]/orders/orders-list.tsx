"use client";

import type { OrderStats, OrderSummary, Paginated } from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataGrid,
  Dialog,
  ConfirmDialog,
  FormField,
  Input,
  PlusIcon,
  Tabs,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

import { FulfillmentStatusBadge, OrderStatusBadge, PaymentStatusBadge } from "./order-badges";
import {
  BUILTIN_VIEWS,
  DEFAULT_VIEW_ID,
  loadActiveViewId,
  loadCustomViews,
  saveActiveViewId,
  saveCustomViews,
  type OrderViewFilters,
  type SavedView,
} from "./saved-views";

export function OrdersList({ storeId, storeSlug }: { storeId: string; storeSlug: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [customViews, setCustomViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState(DEFAULT_VIEW_ID);
  const [hydrated, setHydrated] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pages, setPages] = useState<OrderSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OrderStats | null>(null);

  // Saved views live in localStorage, scoped per store, so they never leak across tenants and
  // never touch the backend. Loaded once on mount (and whenever the store changes).
  useEffect(() => {
    const views = loadCustomViews(storeId);
    const savedActiveId = loadActiveViewId(storeId);
    setCustomViews(views);
    const all = [...BUILTIN_VIEWS, ...views];
    const restored = all.find((v) => v.id === savedActiveId);
    setActiveViewId(restored?.id ?? DEFAULT_VIEW_ID);
    setQ(restored?.filters.q ?? "");
    setHydrated(true);
  }, [storeId]);

  const allViews = useMemo(() => [...BUILTIN_VIEWS, ...customViews], [customViews]);
  const currentView = useMemo(
    () => allViews.find((v) => v.id === activeViewId) ?? BUILTIN_VIEWS[0]!,
    [allViews, activeViewId],
  );
  const filters: OrderViewFilters = useMemo(
    () => ({ ...currentView.filters, q }),
    [currentView, q],
  );

  const selectView = useCallback(
    (id: string) => {
      const target = allViews.find((v) => v.id === id);
      setActiveViewId(id);
      // Built-in tabs (Open/Unfulfilled/etc.) all carry an empty saved `q`, so switching between
      // them must leave whatever the merchant has typed in the search box alone — search narrows
      // within a tab, it isn't reset by clicking one. A custom saved view, on the other hand, is
      // meant to restore the exact combination (including search term) the merchant saved, so
      // only custom views should override `q`.
      if (target && !target.builtin) {
        setQ(target.filters.q);
      }
      saveActiveViewId(storeId, id);
    },
    [allViews, storeId],
  );

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (filters.q.trim()) params.set("q", filters.q.trim());
        if (filters.status) params.set("status", filters.status);
        if (filters.open) params.set("open", "true");
        if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
        if (filters.fulfillmentStatus) params.set("fulfillmentStatus", filters.fulfillmentStatus);
        if (after) params.set("cursor", after);
        const [res, s] = await Promise.all([
          api<Paginated<OrderSummary>>(`/stores/${storeId}/orders?${params}`),
          append ? null : api<{ data: OrderStats }>(`/stores/${storeId}/orders/stats`),
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
    [storeId, filters],
  );
  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => void load(null, false), filters.q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, filters.q, hydrated]);

  // "High value" has no server-side query param, so it's applied client-side against whichever
  // page(s) are already loaded for the active server-side filters.
  const rows = useMemo(() => {
    const flat = pages.flat();
    const minTotal = filters.minTotal;
    return minTotal === null ? flat : flat.filter((o) => o.total.amount >= minTotal);
  }, [pages, filters.minTotal]);

  const columns: DataGridColumn<OrderSummary>[] = [
    {
      key: "name",
      header: "Order",
      cell: (o) => (
        <div>
          <Link href={`/${storeSlug}/orders/${o.id}`} className="font-medium hover:underline">
            {o.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {new Date(o.createdAt).toLocaleString()}
            {o.poNumber ? ` · PO ${o.poNumber}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "buyer",
      header: "Buyer",
      cell: (o) => (
        <div>
          <div>
            {o.buyer.company?.displayName ?? o.buyer.customer?.displayName ?? o.email ?? "Guest"}
          </div>
          <div className="text-xs text-muted-foreground">
            {o.buyer.company
              ? (o.buyer.location?.name ?? o.buyer.customer?.displayName ?? "")
              : (o.buyer.customer?.email ?? "")}
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: "payment",
      header: "Payment",
      cell: (o) => <PaymentStatusBadge status={o.paymentStatus} />,
    },
    {
      key: "fulfillment",
      header: "Fulfillment",
      cell: (o) => <FulfillmentStatusBadge status={o.fulfillmentStatus} />,
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cell: (o) => <span className="tabular-nums">{o.itemCount}</span>,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (o) => <span className="tabular-nums font-medium">{formatMoney(o.total)}</span>,
    },
  ];

  const filtered =
    filters.q.trim() !== "" ||
    filters.status !== "" ||
    filters.open ||
    filters.paymentStatus !== "" ||
    filters.fulfillmentStatus !== "" ||
    filters.minTotal !== null;

  const canSaveView = filtered && currentView.id !== "builtin:all";

  function submitSaveView() {
    const name = saveName.trim();
    if (!name) return;
    const view: SavedView = {
      id: `view:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
      name,
      builtin: false,
      filters: { ...filters },
    };
    const next = [...customViews, view];
    setCustomViews(next);
    saveCustomViews(storeId, next);
    setActiveViewId(view.id);
    saveActiveViewId(storeId, view.id);
    setSaveDialogOpen(false);
    setSaveName("");
  }

  function confirmDeleteView() {
    const next = customViews.filter((v) => v.id !== currentView.id);
    setCustomViews(next);
    saveCustomViews(storeId, next);
    setDeleteDialogOpen(false);
    selectView(DEFAULT_VIEW_ID);
  }

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Open orders" value={String(stats.openOrders)} />
          <Stat label="Awaiting payment" value={String(stats.awaitingPayment)} />
          <Stat label="To fulfill" value={String(stats.toFulfill)} />
          <Stat
            label="Sales, last 30 days"
            value={formatMoney(stats.grossSalesLast30Days)}
            hint={`${stats.ordersLast30Days} orders · AOV ${formatMoney(stats.averageOrderValueLast30Days)}`}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          aria-label="Saved order views"
          value={activeViewId}
          onChange={selectView}
          items={allViews.map((v) => ({
            value: v.id,
            label: v.name,
            count:
              v.id === "builtin:open"
                ? stats?.openOrders
                : v.id === "builtin:unpaid"
                  ? stats?.awaitingPayment
                  : v.id === "builtin:unfulfilled"
                    ? stats?.toFulfill
                    : undefined,
          }))}
        />
        <div className="flex shrink-0 items-center gap-2">
          {!currentView.builtin && (
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              Delete view
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!canSaveView}
            title={
              canSaveView
                ? "Save this filter combination as a view"
                : "Apply a filter or search first"
            }
            onClick={() => {
              setSaveName("");
              setSaveDialogOpen(true);
            }}
          >
            <PlusIcon size={14} />
            Save as new view
          </Button>
        </div>
      </div>
      <Input
        placeholder="Search by order number, buyer, PO number or SKU"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search orders"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={loading}
        onRowClick={(o) => router.push(`/${storeSlug}/orders/${o.id}`)}
        empty={{
          title: filtered ? "No orders match" : "No orders yet",
          description: filtered
            ? "Try another view, filter or search."
            : "Orders arrive from the storefront checkout or from a draft order you complete.",
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        title="Save as new view"
        description="Saves the currently applied filters and search as a view you can switch back to. Stored in this browser only."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitSaveView} disabled={!saveName.trim()}>
              Save view
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSaveView();
          }}
        >
          <FormField id="saved-view-name" label="View name">
            <Input
              id="saved-view-name"
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Acme unfulfilled"
            />
          </FormField>
        </form>
      </Dialog>
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDeleteView}
        title={`Delete "${currentView.name}"?`}
        description="This only removes the saved view from this browser. It doesn't affect any orders."
        confirmLabel="Delete view"
        destructive
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  );
}
