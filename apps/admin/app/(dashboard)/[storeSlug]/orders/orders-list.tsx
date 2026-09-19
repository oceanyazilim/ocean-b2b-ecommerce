"use client";

import {
  FULFILLMENT_STATUSES,
  PAYMENT_STATUSES,
  type OrderStats,
  type OrderSummary,
  type Paginated,
} from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataGrid,
  Dialog,
  ConfirmDialog,
  FormField,
  Input,
  PlusIcon,
  Select,
  Tabs,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

import { bulkCancel, bulkConfirmPayments, bulkMarkFulfilled, type BulkResult } from "./bulk-actions";
import { FulfillmentStatusBadge, PaymentStatusBadge } from "./order-badges";
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

const SOURCE_LABEL: Record<string, string> = {
  storefront: "Online store",
  draft_order: "Draft order",
  quote: "Quote",
  admin: "Admin",
  api: "API",
};

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

  // Extra filters beyond the saved-view tabs: date range, plus explicit payment/fulfillment
  // filters for when a merchant wants a combination a tab doesn't cover.
  const [showFilters, setShowFilters] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ action: string; result: BulkResult } | null>(
    null,
  );
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState("");

  // Saved views live in localStorage, scoped per store, so they never leak across tenants and
  // never touch the backend. Loaded once on mount (and whenever the store changes). A `?view=`
  // query param (used by the dashboard's "needs attention" links) overrides the remembered tab
  // for that navigation, so "12 orders waiting for fulfillment" actually lands on that tab.
  useEffect(() => {
    const views = loadCustomViews(storeId);
    const fromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("view")
        : null;
    const savedActiveId = fromUrl ?? loadActiveViewId(storeId);
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
      setSelected(new Set());
    },
    [allViews, storeId],
  );

  // Explicit filters are ANDed on top of whatever the active tab already narrows to — e.g.
  // "Open" + payment status "pending" + a date range all apply together.
  const effectivePaymentStatus = filters.paymentStatus || paymentStatus;
  const effectiveFulfillmentStatus = filters.fulfillmentStatus || fulfillmentStatus;

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (filters.q.trim()) params.set("q", filters.q.trim());
        if (filters.status) params.set("status", filters.status);
        if (filters.open) params.set("open", "true");
        if (effectivePaymentStatus) params.set("paymentStatus", effectivePaymentStatus);
        if (effectiveFulfillmentStatus) params.set("fulfillmentStatus", effectiveFulfillmentStatus);
        if (dateFrom) params.set("from", new Date(`${dateFrom}T00:00:00.000Z`).toISOString());
        if (dateTo) params.set("to", new Date(`${dateTo}T23:59:59.999Z`).toISOString());
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
    [storeId, filters, effectivePaymentStatus, effectiveFulfillmentStatus, dateFrom, dateTo],
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
          {o.poNumber && <div className="text-xs text-muted-foreground">PO {o.poNumber}</div>}
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (o) => (
        <span className="text-xs text-muted-foreground">
          {new Date(o.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "buyer",
      header: "Customer",
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
    {
      key: "channel",
      header: "Channel",
      cell: (o) => (
        <span className="text-xs text-muted-foreground">
          {SOURCE_LABEL[o.source] ?? o.source}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (o) => <span className="tabular-nums font-medium">{formatMoney(o.total)}</span>,
    },
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
      key: "delivery",
      header: "Delivery",
      cell: (o) => (
        <span className="text-xs text-muted-foreground">{o.shippingRateName ?? "—"}</span>
      ),
    },
  ];

  const filtered =
    filters.q.trim() !== "" ||
    filters.status !== "" ||
    filters.open ||
    effectivePaymentStatus !== "" ||
    effectiveFulfillmentStatus !== "" ||
    filters.minTotal !== null ||
    dateFrom !== "" ||
    dateTo !== "";

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

  async function runBulkAction(
    label: string,
    action: (ids: string[]) => Promise<BulkResult>,
  ) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkPending(true);
    setBulkResult(null);
    try {
      const result = await action(ids);
      setBulkResult({ action: label, result });
      setSelected(new Set());
      void load(null, false);
    } finally {
      setBulkPending(false);
    }
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
              v.id === "builtin:unpaid"
                ? stats?.awaitingPayment
                : v.id === "builtin:unfulfilled"
                  ? stats?.toFulfill
                  : v.id === "builtin:open"
                    ? stats?.openOrders
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
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by order number, buyer, PO number or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
          aria-label="Search orders"
        />
        <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? "Hide filters" : "Filters"}
        </Button>
      </div>
      {showFilters && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <FormField id="f-payment" label="Payment status">
              <Select
                id="f-payment"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                disabled={!!filters.paymentStatus}
              >
                <option value="">Any</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="f-fulfillment" label="Fulfillment status">
              <Select
                id="f-fulfillment"
                value={fulfillmentStatus}
                onChange={(e) => setFulfillmentStatus(e.target.value)}
                disabled={!!filters.fulfillmentStatus}
              >
                <option value="">Any</option>
                {FULFILLMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="f-from" label="From">
              <Input
                id="f-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </FormField>
            <FormField id="f-to" label="To">
              <Input
                id="f-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </FormField>
            {(paymentStatus || fulfillmentStatus || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPaymentStatus("");
                  setFulfillmentStatus("");
                  setDateFrom("");
                  setDateTo("");
                }}
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      {bulkResult && (
        <Alert
          variant={bulkResult.result.failed.length === 0 ? "success" : "warning"}
          title={bulkResult.action}
        >
          {bulkResult.result.succeeded} succeeded
          {bulkResult.result.failed.length > 0 &&
            `, ${bulkResult.result.failed.length} failed: ${bulkResult.result.failed
              .map((f) => f.message)
              .slice(0, 3)
              .join("; ")}`}
        </Alert>
      )}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(o) => o.id}
        loading={loading}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        onRowClick={(o) => router.push(`/${storeSlug}/orders/${o.id}`)}
        bulkActions={
          <>
            <Button
              size="sm"
              variant="outline"
              loading={bulkPending}
              onClick={() => void runBulkAction("Mark fulfilled", (ids) => bulkMarkFulfilled(storeId, ids))}
            >
              Mark fulfilled
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={bulkPending}
              onClick={() =>
                void runBulkAction("Confirm payment", (ids) => bulkConfirmPayments(storeId, ids))
              }
            >
              Confirm payment
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBulkCancelReason("");
                setBulkCancelOpen(true);
              }}
            >
              Cancel
            </Button>
          </>
        }
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
      <Dialog
        open={bulkCancelOpen}
        onClose={() => setBulkCancelOpen(false)}
        title={`Cancel ${selected.size} order${selected.size === 1 ? "" : "s"}?`}
        description="Reserved stock is released and each order's totals are reverted. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBulkCancelOpen(false)} disabled={bulkPending}>
              Keep orders
            </Button>
            <Button
              variant="destructive"
              loading={bulkPending}
              disabled={!bulkCancelReason.trim()}
              onClick={() => {
                setBulkCancelOpen(false);
                void runBulkAction("Cancel orders", (ids) =>
                  bulkCancel(storeId, ids, bulkCancelReason.trim()),
                );
              }}
            >
              Cancel orders
            </Button>
          </>
        }
      >
        <FormField id="bulk-cancel-reason" label="Reason">
          <Textarea
            id="bulk-cancel-reason"
            rows={3}
            value={bulkCancelReason}
            onChange={(e) => setBulkCancelReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
        </FormField>
      </Dialog>
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
