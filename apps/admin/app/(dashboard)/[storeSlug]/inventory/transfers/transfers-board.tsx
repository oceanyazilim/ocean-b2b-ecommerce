"use client";

import type {
  InventoryItemSummary,
  LocationSummary,
  Paginated,
  TransferRequestSummary,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Tabs,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { formatWhen, itemLabel, TRANSFER_STATUS } from "../format";

type View = "pending" | "all";

export function TransfersBoard({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [view, setView] = useState<View>("pending");
  const [rows, setRows] = useState<TransferRequestSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<TransferRequestSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const decision = useSubmit();

  useEffect(() => {
    api<{ data: LocationSummary[] }>(`/stores/${storeId}/locations`)
      .then((r) => setLocations(r.data.filter((l) => l.isActive)))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [storeId]);

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (view === "pending") params.set("status", "pending");
        if (after) params.set("cursor", after);
        const res = await api<Paginated<TransferRequestSummary>>(
          `/stores/${storeId}/inventory/transfer-requests?${params}`,
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
    [storeId, view],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  async function decide(
    t: TransferRequestSummary,
    status: "approved" | "rejected" | "cancelled",
    rejectionReason?: string,
  ) {
    setBusyId(t.id);
    const res = await decision.run(() =>
      api(`/stores/${storeId}/inventory/transfer-requests/${t.id}/decision`, {
        body: { status, rejectionReason: rejectionReason ?? null },
      }),
    );
    setBusyId(null);
    if (res !== undefined) {
      setRejecting(null);
      await load(null, false);
    }
    return res !== undefined;
  }

  const columns: DataGridColumn<TransferRequestSummary>[] = [
    {
      key: "item",
      header: "Item",
      cell: (t) => (
        <div>
          <div className="font-medium">{t.item.title}</div>
          {t.item.sku && <div className="text-xs text-muted-foreground">SKU {t.item.sku}</div>}
        </div>
      ),
    },
    {
      key: "route",
      header: "Route",
      cell: (t) => (
        <span>
          {t.fromLocation.name} <span className="text-muted-foreground">→</span> {t.toLocation.name}
        </span>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      className: "text-right",
      cell: (t) => <span className="font-semibold tabular-nums">{t.quantity}</span>,
    },
    {
      key: "requested",
      header: "Requested",
      cell: (t) => (
        <div className="text-muted-foreground">
          <div>{t.requestedBy?.name ?? "—"}</div>
          <div className="text-xs">{formatWhen(t.createdAt)}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => (
        <div>
          <Badge variant={TRANSFER_STATUS[t.status].variant}>
            {TRANSFER_STATUS[t.status].label}
          </Badge>
          {t.status !== "pending" && t.approvedBy && (
            <div className="mt-1 text-xs text-muted-foreground">
              {t.approvedBy.name} · {formatWhen(t.approvedAt)}
            </div>
          )}
          {t.rejectionReason && (
            <div className="mt-1 text-xs text-muted-foreground">{t.rejectionReason}</div>
          )}
        </div>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (t: TransferRequestSummary) =>
              t.status === "pending" ? (
                <div className="flex flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    loading={busyId === t.id}
                    onClick={() => void decide(t, "approved")}
                  >
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(t)}>
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === t.id}
                    onClick={() => void decide(t, "cancelled")}
                  >
                    Cancel
                  </Button>
                </div>
              ) : null,
          } satisfies DataGridColumn<TransferRequestSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<View>
          aria-label="Transfer view"
          value={view}
          onChange={setView}
          items={[
            { value: "pending", label: "Awaiting approval" },
            { value: "all", label: "All transfers" },
          ]}
        />
        {canWrite && (
          <Button onClick={() => setCreating(true)} disabled={locations.length < 2}>
            New transfer
          </Button>
        )}
      </div>
      {locations.length < 2 && !loading && (
        <Alert variant="info">Transfers need at least two active locations.</Alert>
      )}
      {(error ?? decision.error) && <Alert variant="error">{error ?? decision.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        empty={{
          title: view === "pending" ? "Nothing awaiting approval" : "No transfers yet",
          description:
            view === "pending"
              ? "Requested transfers show up here until someone approves or rejects them."
              : "Move stock between locations directly or through an approval step.",
        }}
        pageInfo={{ hasNextPage: hasNext, onNext: () => void load(cursor, true) }}
      />
      <TransferDialog
        storeId={storeId}
        open={creating}
        locations={locations}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          void load(null, false);
        }}
      />
      <RejectDialog
        transfer={rejecting}
        pending={busyId === rejecting?.id}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) =>
          rejecting ? decide(rejecting, "rejected", reason) : Promise.resolve(false)
        }
      />
    </div>
  );
}

function TransferDialog({
  storeId,
  open,
  locations,
  onClose,
  onDone,
}: {
  storeId: string;
  open: boolean;
  locations: LocationSummary[];
  onClose: () => void;
  onDone: () => void;
}) {
  const submit = useSubmit();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<InventoryItemSummary[]>([]);
  const [item, setItem] = useState<InventoryItemSummary | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [approval, setApproval] = useState(true);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      try {
        const res = await api<Paginated<InventoryItemSummary>>(
          `/stores/${storeId}/inventory/items?limit=15${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`,
        );
        setItems(res.data);
      } catch {
        setItems([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [storeId, q, open]);

  useEffect(() => {
    if (!open) return;
    const def = locations.find((l) => l.isDefault) ?? locations[0];
    const other = locations.find((l) => l.id !== def?.id);
    setFromId(def?.id ?? "");
    setToId(other?.id ?? "");
  }, [open, locations]);

  function close() {
    setQ("");
    setItem(null);
    setQuantity("");
    setReference("");
    setNotes("");
    submit.reset();
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item) return;
    const body = {
      itemId: item.id,
      fromLocationId: fromId,
      toLocationId: toId,
      quantity: Number(quantity),
    };
    const res = await submit.run(() =>
      approval
        ? api(`/stores/${storeId}/inventory/transfer-requests`, { body })
        : api(`/stores/${storeId}/inventory/transfers`, {
            body: { ...body, reference: reference.trim() || null, notes: notes.trim() || null },
          }),
    );
    if (res !== undefined) {
      close();
      onDone();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New transfer"
      description="Move sellable units from one location to another."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="transfer-form"
            loading={submit.pending}
            disabled={!item || !fromId || !toId || fromId === toId || !quantity}
          >
            {approval ? "Request transfer" : "Transfer now"}
          </Button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="tr-item" label="Item" error={submit.fieldErrors.itemId}>
          {item ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{itemLabel(item)}</span>
                <span className="ml-2 text-muted-foreground">{item.available} available</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setItem(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                id="tr-item"
                placeholder="Search tracked items"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
              />
              <div
                className="max-h-48 overflow-y-auto rounded-md border"
                role="listbox"
                aria-label="Items"
              >
                {items.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">No tracked items match.</p>
                )}
                {items.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => setItem(i)}
                    className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent/60"
                  >
                    <span className="truncate">{itemLabel(i)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {i.available} avail.
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="tr-from" label="From" error={submit.fieldErrors.fromLocationId}>
            <Select id="tr-from" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="tr-to" label="To" error={submit.fieldErrors.toLocationId}>
            <Select id="tr-to" value={toId} onChange={(e) => setToId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === fromId}>
                  {l.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="tr-qty" label="Quantity" error={submit.fieldErrors.quantity}>
            <Input
              id="tr-qty"
              type="number"
              min={1}
              step={1}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              invalid={!!submit.fieldErrors.quantity}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={approval} onChange={(e) => setApproval(e.target.checked)} />
          Requires approval before stock moves
        </label>
        {!approval && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="tr-ref" label="Reference">
              <Input
                id="tr-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
              />
            </FormField>
            <FormField id="tr-notes" label="Notes">
              <Textarea
                id="tr-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
              />
            </FormField>
          </div>
        )}
      </form>
    </Dialog>
  );
}

function RejectDialog({
  transfer,
  pending,
  onClose,
  onConfirm,
}: {
  transfer: TransferRequestSummary | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => setReason(""), [transfer]);
  return (
    <Dialog
      open={!!transfer}
      onClose={onClose}
      title="Reject transfer"
      description={transfer ? `${transfer.quantity} × ${transfer.item.title}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Back
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            disabled={!reason.trim()}
            onClick={() => void onConfirm(reason.trim())}
          >
            Reject
          </Button>
        </>
      }
    >
      <FormField id="reject-reason" label="Reason">
        <Textarea
          id="reject-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          autoFocus
        />
      </FormField>
    </Dialog>
  );
}
