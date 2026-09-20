"use client";

import type { OrderStatus, OrderSummary, Paginated } from "@ocean/types";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const STATUS_BADGE: Record<OrderStatus, "success" | "secondary" | "warning"> = {
  pending_approval: "warning",
  confirmed: "secondary",
  processing: "secondary",
  completed: "success",
  cancelled: "warning",
};

// Real order history for this company, fetched read-only via the orders API's `companyId` filter
// — orders themselves stay owned by the (separately redesigned) Orders module; this tab never
// writes to an order and links back into that module for detail/actions.
export function CompanyOrders({
  storeId,
  storeSlug,
  companyId,
}: {
  storeId: string;
  storeSlug: string;
  companyId: string;
}) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Paginated<OrderSummary>>(
      `/stores/${storeId}/orders?companyId=${companyId}&limit=25&sort=created_desc`,
    )
      .then((res) => {
        if (cancelled) return;
        setOrders(res.data);
        setHasMore(res.pageInfo.hasNextPage);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, companyId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders</CardTitle>
        <CardDescription>The most recent orders placed by any buyer at this company.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <Alert variant="error">{error}</Alert>}
        {!orders && !error && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {orders && orders.length === 0 && (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        )}
        {orders && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Buyer</th>
                  <th className="py-2 pr-4 font-medium">Location</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/${storeSlug}/orders/${o.id}`}
                        className="font-medium hover:underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE[o.status]}>{o.status.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {o.buyer.customer?.displayName ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {o.buyer.location?.name ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(o.total)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <p className="pt-2 text-xs text-muted-foreground">
                Showing the 25 most recent orders.{" "}
                <Link href={`/${storeSlug}/orders?companyId=${companyId}`} className="hover:underline">
                  View all in Orders →
                </Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
