"use client";

import type { QuoteStatus, QuoteSummary } from "@ocean/types";
import { Alert, Badge, Button, DataGrid, Select, type DataGridColumn } from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";

const STATUS_VARIANT: Record<QuoteStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  accepted: "success",
  declined: "destructive",
  expired: "warning",
  converted: "success",
};

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
  const [status, setStatus] = useState<QuoteStatus | "">("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await api<{ data: QuoteSummary[] }>(`/stores/${storeId}/quotes${qs}`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId, status]);

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
      cell: (q) => <Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge>,
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
        <Select value={status} onChange={(e) => setStatus(e.target.value as QuoteStatus | "")} className="w-48">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
          <option value="converted">Converted</option>
        </Select>
        {canWrite && (
          <Link href={`/${storeSlug}/quotes/new`}>
            <Button>New quote</Button>
          </Link>
        )}
      </div>
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
