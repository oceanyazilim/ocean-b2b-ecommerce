"use client";

import {
  INVENTORY_MOVEMENT_REASONS,
  type InventoryMovementEntry,
  type InventoryMovementReason,
  type LocationSummary,
  type Paginated,
} from "@ocean/types";
import { Alert, Badge, cn, DataGrid, Input, Select, type DataGridColumn } from "@ocean/ui";
import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "@/lib/api";

import { formatWhen, REASON_LABELS } from "../format";

export function MovementsLedger({ storeId }: { storeId: string }) {
  const [reason, setReason] = useState<"" | InventoryMovementReason>("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [rows, setRows] = useState<InventoryMovementEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: LocationSummary[] }>(`/stores/${storeId}/locations`)
      .then((r) => setLocations(r.data))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [storeId]);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (reason) params.set("reason", reason);
        if (locationId) params.set("locationId", locationId);
        if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
        if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<InventoryMovementEntry>>(
          `/stores/${storeId}/inventory/movements?${params}`,
        );
        setRows((prev) => (append ? [...prev, ...res.data] : res.data));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [storeId, reason, locationId, from, to],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  const columns: DataGridColumn<InventoryMovementEntry>[] = [
    {
      key: "when",
      header: "When",
      cell: (m) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatWhen(m.createdAt)}</span>
      ),
    },
    {
      key: "item",
      header: "Item",
      cell: (m) => (
        <div>
          <div className="font-medium">{m.item.title}</div>
          {m.item.sku && <div className="text-xs text-muted-foreground">SKU {m.item.sku}</div>}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      cell: (m) => <Badge variant="outline">{REASON_LABELS[m.reason]}</Badge>,
    },
    {
      key: "route",
      header: "From → To",
      cell: (m) => (
        <span className="whitespace-nowrap">
          {m.fromLocation?.name ?? "—"} <span className="text-muted-foreground">→</span>{" "}
          {m.toLocation?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      className: "text-right",
      cell: (m) => {
        const out = m.fromLocation && !m.toLocation;
        const inbound = m.toLocation && !m.fromLocation;
        return (
          <span
            className={cn(
              "font-semibold tabular-nums",
              out && "text-destructive",
              inbound && "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {out ? "−" : inbound ? "+" : ""}
            {m.quantity}
          </span>
        );
      },
    },
    {
      key: "reference",
      header: "Reference",
      cell: (m) => <span className="text-muted-foreground">{m.reference ?? "—"}</span>,
    },
    {
      key: "actor",
      header: "By",
      cell: (m) => <span className="text-muted-foreground">{m.actor?.name ?? "System"}</span>,
    },
    {
      key: "notes",
      header: "Notes",
      cell: (m) => (
        <span className="line-clamp-2 max-w-xs text-xs text-muted-foreground">{m.notes ?? ""}</span>
      ),
    },
  ];

  const filtered = !!(reason || locationId || from || to);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Every stock change, in order, with who made it and why. Entries are never edited.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Reason
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value as "" | InventoryMovementReason)}
            className="w-44"
          >
            <option value="">All reasons</option>
            {INVENTORY_MOVEMENT_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Location
          <Select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-48"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </label>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={loading}
        empty={{
          title: filtered ? "No movements match" : "No movements yet",
          description: filtered
            ? "Widen the date range or clear a filter."
            : "Adjustments, counts and transfers will appear here as they happen.",
        }}
        pageInfo={{ hasNextPage: hasNext, onNext: () => void load(cursor, true) }}
      />
    </div>
  );
}
