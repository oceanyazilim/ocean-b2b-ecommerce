"use client";

import type { Paginated, QuoteStatus, QuoteSummary } from "@ocean/types";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@ocean/ui";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const STATUS_BADGE: Record<QuoteStatus, "success" | "secondary" | "warning"> = {
  draft: "secondary",
  sent: "warning",
  accepted: "success",
  declined: "secondary",
  expired: "secondary",
  converted: "success",
};

// Real quotes for this company, fetched read-only via the quotes API's `companyId` filter. Quote
// creation/editing stays owned by the Quotes module (built and restyled separately); this tab
// only links out to it.
export function CompanyQuotes({
  storeId,
  storeSlug,
  companyId,
}: {
  storeId: string;
  storeSlug: string;
  companyId: string;
}) {
  const [quotes, setQuotes] = useState<QuoteSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Paginated<QuoteSummary>>(`/stores/${storeId}/quotes?companyId=${companyId}&limit=25`)
      .then((res) => {
        if (cancelled) return;
        setQuotes(res.data);
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
        <CardTitle>Quotes</CardTitle>
        <CardDescription>Quote requests and offers for this company.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <Alert variant="error">{error}</Alert>}
        {!quotes && !error && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {quotes && quotes.length === 0 && (
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
        )}
        {quotes && quotes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Quote</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 text-right font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Expires</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {quotes.map((q) => (
                  <tr key={q.id}>
                    <td className="py-2 pr-4">
                      <Link
                        href={`/${storeSlug}/quotes/${q.id}`}
                        className="font-medium hover:underline"
                      >
                        {q.number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE[q.status]}>{q.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(q.total)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {q.expiresAt ? new Date(q.expiresAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(q.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMore && (
              <p className="pt-2 text-xs text-muted-foreground">
                Showing the 25 most recent quotes.{" "}
                <Link href={`/${storeSlug}/quotes`} className="hover:underline">
                  View all in Quotes →
                </Link>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
