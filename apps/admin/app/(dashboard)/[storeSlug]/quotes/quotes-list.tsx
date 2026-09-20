"use client";

import type { QuoteStatus, QuoteSummary } from "@ocean/types";
import { Alert, Button, DataGrid, Tabs, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

import { QuoteStatusBadge } from "./quote-badges";

type View = "all" | QuoteStatus;

export function QuotesList({
  storeId,
  storeSlug,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("all");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = view !== "all" ? `?status=${view}` : "";
      const res = await api<{ data: QuoteSummary[] }>(`/stores/${storeId}/quotes${qs}`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<QuoteSummary>[] = [
    {
      key: "number",
      header: "Quote",
      cell: (q) => (
        <Link href={`/${storeSlug}/quotes/${q.id}`} className="font-medium hover:underline">
          {q.number}
        </Link>
      ),
    },
    { key: "company", header: "Company", cell: (q) => q.companyName },
    {
      key: "status",
      header: "Status",
      cell: (q) => <QuoteStatusBadge status={q.status} />,
    },
    { key: "total", header: "Total", className: "text-right", cell: (q) => formatMoney(q.total) },
    {
      key: "expiresAt",
      header: "Expires",
      cell: (q) => (q.expiresAt ? new Date(q.expiresAt).toLocaleDateString() : "—"),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Negotiated B2B offers. An accepted quote converts to a real order.
        </p>
        {canWrite && (
          <Link href={`/${storeSlug}/quotes/new`}>
            <Button>New quote</Button>
          </Link>
        )}
      </div>
      <Tabs
        aria-label="Filter by status"
        value={view}
        onChange={setView}
        items={[
          { value: "all", label: "All" },
          { value: "draft", label: "Draft" },
          { value: "sent", label: "Sent" },
          { value: "accepted", label: "Accepted" },
          { value: "declined", label: "Declined" },
          { value: "expired", label: "Expired" },
          { value: "converted", label: "Converted" },
        ]}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(q) => q.id}
        loading={loading}
        empty={{
          title: "No quotes yet",
          description: "Draft a quote for a company to start a B2B negotiation.",
          action: canWrite ? (
            <Link href={`/${storeSlug}/quotes/new`}>
              <Button>Draft your first quote</Button>
            </Link>
          ) : undefined,
        }}
      />
    </div>
  );
}
