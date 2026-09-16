"use client";

import type { Paginated, PriceListStatus, PriceListSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  DataGrid,
  Dialog,
  FormField,
  Input,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export const PRICE_LIST_STATUS_BADGE: Record<PriceListStatus, "success" | "secondary" | "warning"> =
  {
    active: "success",
    draft: "secondary",
    archived: "warning",
  };

export function formatBps(bps: number): string {
  if (bps === 0) return "No adjustment";
  const pct = (Math.abs(bps) / 100).toFixed(bps % 100 === 0 ? 0 : 2);
  return bps < 0 ? `${pct}% off` : `+${pct}%`;
}

export function PriceListsList({
  storeId,
  storeSlug,
  currency,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  currency: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<PriceListSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<PriceListSummary>>(
          `/stores/${storeId}/price-lists?${params}`,
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
    [storeId, q],
  );
  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);
  const rows = useMemo(() => pages.flat(), [pages]);

  const columns: DataGridColumn<PriceListSummary>[] = [
    {
      key: "name",
      header: "Price list",
      cell: (p) => (
        <div>
          <Link
            href={`/${storeSlug}/pricing/price-lists/${p.id}`}
            className="font-medium hover:underline"
          >
            {p.name}
          </Link>
          {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => <Badge variant={PRICE_LIST_STATUS_BADGE[p.status]}>{p.status}</Badge>,
    },
    { key: "adjustment", header: "Adjustment", cell: (p) => formatBps(p.adjustmentBps) },
    {
      key: "priority",
      header: "Priority",
      className: "text-right",
      cell: (p) => <span className="tabular-nums">{p.priority}</span>,
    },
    {
      key: "prices",
      header: "Explicit prices",
      className: "text-right",
      cell: (p) => <span className="tabular-nums">{p.priceCount}</span>,
    },
    {
      key: "assignments",
      header: "Assigned to",
      className: "text-right",
      cell: (p) => <span className="tabular-nums">{p.assignmentCount}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A list fixes explicit variant prices or adjusts base prices by a percentage. The
          highest-priority active list assigned to a buyer applies. All lists use {currency}.
        </p>
        {canWrite && <Button onClick={() => setCreating(true)}>New price list</Button>}
      </div>
      <Input
        placeholder="Search price lists"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search price lists"
      />
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        loading={loading}
        onRowClick={(p) => router.push(`/${storeSlug}/pricing/price-lists/${p.id}`)}
        empty={{
          title: q ? "No price lists match" : "No price lists yet",
          description: q ? "Try another search." : "Create a list, set prices, assign companies.",
          action:
            canWrite && !q ? (
              <Button onClick={() => setCreating(true)}>Create your first price list</Button>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
      <NewPriceListDialog
        storeId={storeId}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => router.push(`/${storeSlug}/pricing/price-lists/${id}`)}
      />
    </div>
  );
}

function NewPriceListDialog({
  storeId,
  open,
  onClose,
  onCreated,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [priority, setPriority] = useState("0");
  useEffect(() => {
    reset();
    setName("");
    setPercent("");
    setPriority("0");
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const pct = Number(percent.replace(",", ".")) || 0;
    const res = await submit.run(() =>
      api<{ data: PriceListSummary }>(`/stores/${storeId}/price-lists`, {
        body: { name, adjustmentBps: Math.round(pct * 100), priority: Number(priority) || 0 },
      }),
    );
    if (res) onCreated(res.data.id);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New price list"
      description="Starts as a draft. Negative adjustment = discount, positive = markup."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="new-price-list" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="new-price-list" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="pl-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="pl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            id="pl-adj"
            label="Adjustment (%)"
            hint="e.g. -10 for 10% off"
            error={submit.fieldErrors.adjustmentBps}
          >
            <Input
              id="pl-adj"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </FormField>
          <FormField
            id="pl-prio"
            label="Priority"
            hint="Higher wins"
            error={submit.fieldErrors.priority}
          >
            <Input
              id="pl-prio"
              type="number"
              min={0}
              max={1000}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
