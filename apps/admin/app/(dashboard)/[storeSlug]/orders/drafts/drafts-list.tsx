"use client";

import type { DraftOrderStatus, DraftOrderSummary, Paginated } from "@ocean/types";
import { Alert, Badge, Button, DataGrid, Input, Tabs, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

type View = "open" | "completed" | "cancelled" | "all";
const BADGE: Record<DraftOrderStatus, "default" | "success" | "secondary"> = {
  open: "default",
  completed: "success",
  cancelled: "secondary",
};

export function DraftsList({
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
  const [view, setView] = useState<View>("open");
  const [pages, setPages] = useState<DraftOrderSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (view !== "all") params.set("status", view);
        if (after) params.set("cursor", after);
        const res = await api<Paginated<DraftOrderSummary>>(
          `/stores/${storeId}/draft-orders?${params}`,
        );
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
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

  const columns: DataGridColumn<DraftOrderSummary>[] = [
    {
      key: "name",
      header: "Draft",
      cell: (d) => (
        <div>
          <Link
            href={`/${storeSlug}/orders/drafts/${d.id}`}
            className="font-medium hover:underline"
          >
            {d.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {new Date(d.updatedAt).toLocaleString()} · {d.createdBy.name}
          </div>
        </div>
      ),
    },
    {
      key: "buyer",
      header: "Buyer",
      cell: (d) => (
        <span>
          {d.buyer.company?.displayName ?? d.buyer.customer?.displayName ?? d.email ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (d) => (
        <div className="flex items-center gap-2">
          <Badge variant={BADGE[d.status]}>{d.status}</Badge>
          {d.completedOrderId && (
            <Link
              href={`/${storeSlug}/orders/${d.completedOrderId}`}
              className="text-xs hover:underline"
            >
              open order
            </Link>
          )}
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      className: "text-right",
      cell: (d) => <span className="tabular-nums">{d.itemCount}</span>,
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (d) => <span className="tabular-nums font-medium">{formatMoney(d.total)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        aria-label="Filter drafts"
        value={view}
        onChange={setView}
        items={[
          { value: "open", label: "Open" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "all", label: "All" },
        ]}
      />
      <Input
        placeholder="Search by draft number, buyer or PO number"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search draft orders"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        onRowClick={(d) => router.push(`/${storeSlug}/orders/drafts/${d.id}`)}
        empty={{
          title: view === "open" && !q ? "No open drafts" : "No drafts match",
          description: "Build an order for a phone or sales-rep sale, then complete it.",
          action:
            canWrite && view === "open" && !q ? (
              <Link href={`/${storeSlug}/orders/drafts/new`}>
                <Button>New draft order</Button>
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
