"use client";

import type { OrderStats, OrderSummary, Paginated } from "@ocean/types";
import {
  Alert,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataGrid,
  Input,
  Tabs,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

import { FulfillmentStatusBadge, OrderStatusBadge, PaymentStatusBadge } from "./order-badges";

type View = "all" | "open" | "unpaid" | "unfulfilled" | "cancelled";

export function OrdersList({ storeId, storeSlug }: { storeId: string; storeSlug: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("open");
  const [pages, setPages] = useState<OrderSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OrderStats | null>(null);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (view === "open") params.set("open", "true");
        if (view === "unpaid") {
          params.set("open", "true");
          params.set("paymentStatus", "pending");
        }
        if (view === "unfulfilled") {
          params.set("open", "true");
          params.set("fulfillmentStatus", "unfulfilled");
        }
        if (view === "cancelled") params.set("status", "cancelled");
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
    [storeId, q, view],
  );
  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);
  const rows = useMemo(() => pages.flat(), [pages]);

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

  const filtered = q.trim() !== "" || view !== "all";

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
      <Tabs
        aria-label="Filter orders"
        value={view}
        onChange={setView}
        items={[
          { value: "open", label: "Open", count: stats?.openOrders },
          { value: "unpaid", label: "Awaiting payment", count: stats?.awaitingPayment },
          { value: "unfulfilled", label: "To fulfill", count: stats?.toFulfill },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ]}
      />
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
            ? "Try another filter or search."
            : "Orders arrive from the storefront checkout or from a draft order you complete.",
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
