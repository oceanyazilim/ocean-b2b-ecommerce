"use client";

import type { InvoiceStatus, InvoiceSummary, Paginated } from "@ocean/types";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const STATUS_BADGE: Record<InvoiceStatus, "success" | "secondary" | "warning"> = {
  pending: "secondary",
  paid: "success",
  overdue: "warning",
  cancelled: "secondary",
};

// Real invoices for this company, fetched read-only via the invoices API's `companyId` filter.
// Issuing/recording payments stays owned by the finance area under Quotes → Invoices; this tab
// only links out to it.
export function CompanyInvoices({
  storeId,
  storeSlug,
  companyId,
}: {
  storeId: string;
  storeSlug: string;
  companyId: string;
}) {
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Paginated<InvoiceSummary>>(`/stores/${storeId}/invoices?companyId=${companyId}&limit=25`)
      .then((res) => {
        if (cancelled) return;
        setInvoices(res.data);
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
        <CardTitle>Invoices</CardTitle>
        <CardDescription>Invoices issued against this company&apos;s orders.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <Alert variant="error">{error}</Alert>}
        {!invoices && !error && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {invoices && invoices.length === 0 && (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        )}
        {invoices && invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th className="py-2 pr-4 text-right font-medium">Paid</th>
                  <th className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th className="py-2 pr-4 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/${storeSlug}/orders/${inv.orderId}`}
                        className="font-medium hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE[inv.status]}>{inv.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(inv.amount)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {formatMoney(inv.paidAmount)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(inv.balance)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(inv.dueAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <p className="pt-2 text-xs text-muted-foreground">
                Showing the 25 most recent invoices.{" "}
                <Link href={`/${storeSlug}/quotes/invoices`} className="hover:underline">
                  View all in Invoices →
                </Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
