"use client";

import type {
  InventoryItemDetail,
  InventoryMovementEntry,
  LocationSummary,
  Paginated,
} from "@ocean/types";
import { Alert, Badge, Button, Dialog, FormField, Input, Select, Textarea } from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

import { formatWhen, itemLabel, REASON_LABELS, STOCK_STATUS } from "./format";

type Mode = "delta" | "count" | "damage";

export function ItemDialog({
  storeId,
  itemId,
  locations,
  canWrite,
  onClose,
  onChanged,
}: {
  storeId: string;
  itemId: string | null;
  locations: LocationSummary[];
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [item, setItem] = useState<InventoryItemDetail | null>(null);
  const [movements, setMovements] = useState<InventoryMovementEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const submit = useSubmit();
  const { reset } = submit;

  const [mode, setMode] = useState<Mode>("delta");
  const [locationId, setLocationId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<"adjustment" | "return">("adjustment");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!itemId) return;
    try {
      const [detail, recent] = await Promise.all([
        api<{ data: InventoryItemDetail }>(`/stores/${storeId}/inventory/items/${itemId}`),
        api<Paginated<InventoryMovementEntry>>(
          `/stores/${storeId}/inventory/movements?itemId=${itemId}&limit=8`,
        ),
      ]);
      setItem(detail.data);
      setMovements(recent.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [storeId, itemId]);

  useEffect(() => {
    setItem(null);
    setMovements([]);
    setError(null);
    reset();
    void load();
  }, [load, reset]);

  useEffect(() => {
    if (locationId && locations.some((l) => l.id === locationId)) return;
    const first = locations.find((l) => l.isDefault) ?? locations[0];
    setLocationId(first?.id ?? "");
  }, [locations, locationId]);

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!itemId) return;
    const n = Number(amount);
    const body =
      mode === "count"
        ? { itemId, locationId, quantity: n, reason: "count" }
        : mode === "damage"
          ? { itemId, locationId, delta: n, reason: "damage" }
          : { itemId, locationId, delta: n, reason };
    const res = await submit.run(() =>
      api<{ data: InventoryItemDetail }>(`/stores/${storeId}/inventory/adjustments`, {
        body: { ...body, reference: reference.trim() || null, notes: notes.trim() || null },
      }),
    );
    if (res) {
      setAmount("");
      setReference("");
      setNotes("");
      await load();
      onChanged();
    }
  }

  const amountLabel =
    mode === "count"
      ? "Counted quantity"
      : mode === "damage"
        ? "Units to mark damaged (negative restores)"
        : "Change (negative removes)";

  return (
    <Dialog
      open={!!itemId}
      onClose={onClose}
      title={item ? itemLabel(item) : "Inventory item"}
      description={
        item ? (item.sku ? `SKU ${item.sku}` : item.upc ? `UPC ${item.upc}` : undefined) : undefined
      }
      className="max-w-3xl"
    >
      {error && <Alert variant="error">{error}</Alert>}
      {item && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Available", item.available],
              ["On hand", item.onHand],
              ["Reserved", item.reserved],
              ["Damaged", item.damaged],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="text-xl font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant={STOCK_STATUS[item.stockStatus].variant}>
              {STOCK_STATUS[item.stockStatus].label}
            </Badge>
            <span className="text-muted-foreground">Last moved {formatWhen(item.lastMovedAt)}</span>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-medium">Stock by location</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">On hand</th>
                    <th className="px-3 py-2 text-right">Reserved</th>
                    <th className="px-3 py-2 text-right">Damaged</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {item.levels.map((l) => (
                    <tr key={l.locationId}>
                      <td className="px-3 py-2">
                        {l.locationName}
                        {!l.locationActive && (
                          <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {l.available}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.reserved}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.damaged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {canWrite && locations.length > 0 && (
            <form
              onSubmit={(e) => void onAdjust(e)}
              className="flex flex-col gap-3 rounded-md border p-4"
            >
              <h3 className="text-sm font-medium">Adjust stock</h3>
              {submit.error && <Alert variant="error">{submit.error}</Alert>}
              <div className="grid gap-3 sm:grid-cols-3">
                <FormField id="adj-location" label="Location" error={submit.fieldErrors.locationId}>
                  <Select
                    id="adj-location"
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField id="adj-mode" label="Action">
                  <Select
                    id="adj-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                  >
                    <option value="delta">Add or remove units</option>
                    <option value="count">Record a stock count</option>
                    <option value="damage">Mark damaged</option>
                  </Select>
                </FormField>
                <FormField
                  id="adj-amount"
                  label={amountLabel}
                  error={submit.fieldErrors.delta ?? submit.fieldErrors.quantity}
                >
                  <Input
                    id="adj-amount"
                    type="number"
                    step={1}
                    min={mode === "count" ? 0 : undefined}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    invalid={!!(submit.fieldErrors.delta ?? submit.fieldErrors.quantity)}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {mode === "delta" && (
                  <FormField id="adj-reason" label="Reason">
                    <Select
                      id="adj-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value as "adjustment" | "return")}
                    >
                      <option value="adjustment">Adjustment</option>
                      <option value="return">Customer return</option>
                    </Select>
                  </FormField>
                )}
                <FormField id="adj-reference" label="Reference" hint="PO, order or ticket number">
                  <Input
                    id="adj-reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    maxLength={120}
                  />
                </FormField>
                <FormField id="adj-notes" label="Notes" className="sm:col-span-3">
                  <Textarea
                    id="adj-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={1000}
                  />
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={submit.pending} disabled={!amount || !locationId}>
                  Apply
                </Button>
              </div>
            </form>
          )}

          <section>
            <h3 className="mb-2 text-sm font-medium">Recent movements</h3>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements yet.</p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="text-muted-foreground">{formatWhen(m.createdAt)}</span>
                    <Badge variant="outline">{REASON_LABELS[m.reason]}</Badge>
                    <span className="tabular-nums font-medium">
                      {m.fromLocation && !m.toLocation ? "−" : "+"}
                      {m.quantity}
                    </span>
                    <span className="text-muted-foreground">
                      {m.fromLocation?.name ?? "—"} → {m.toLocation?.name ?? "—"}
                    </span>
                    {m.reference && (
                      <span className="text-xs text-muted-foreground">{m.reference}</span>
                    )}
                    {m.actor && (
                      <span className="ml-auto text-xs text-muted-foreground">{m.actor.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
