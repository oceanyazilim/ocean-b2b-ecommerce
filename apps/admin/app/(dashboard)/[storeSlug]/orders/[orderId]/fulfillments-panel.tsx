"use client";

import type { FulfillmentSummary, OrderItemSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  FormField,
  Input,
  type BadgeVariant,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<FulfillmentSummary["status"], BadgeVariant> = {
  pending: "warning",
  shipped: "default",
  delivered: "success",
  cancelled: "secondary",
};

export function FulfillmentsPanel({
  storeId,
  orderId,
  items,
  fulfillments,
  canWrite,
}: {
  storeId: string;
  orderId: string;
  items: OrderItemSummary[];
  fulfillments: FulfillmentSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const base = `/stores/${storeId}/orders/${orderId}`;
  const [creating, setCreating] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);

  const remaining = items.filter((i) => i.requiresShipping && i.fulfilledQuantity < i.quantity);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const lines = remaining
      .map((i) => ({ orderItemId: i.id, quantity: Number(quantities[i.id] ?? 0) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) return;
    const res = await submit.run(() =>
      api(`${base}/fulfillments`, {
        body: {
          items: lines,
          trackingCarrier: trackingCarrier.trim() || null,
          trackingNumber: trackingNumber.trim() || null,
        },
      }),
    );
    if (res !== undefined) {
      setCreating(false);
      setQuantities({});
      setTrackingCarrier("");
      setTrackingNumber("");
      router.refresh();
    }
  }

  async function onAction(fulfillmentId: string, action: "ship" | "deliver") {
    const res = await submit.run(() => api(`${base}/fulfillments/${fulfillmentId}/${action}`, { body: {} }));
    if (res !== undefined) router.refresh();
  }

  async function onCancel() {
    if (!cancelling) return;
    const res = await submit.run(() =>
      api(`${base}/fulfillments/${cancelling}/cancel`, { body: { restock: true } }),
    );
    if (res !== undefined) {
      setCancelling(null);
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Fulfillment</CardTitle>
        {canWrite && remaining.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCreating(true)}>
            Fulfil items
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {fulfillments.length === 0 && <p className="text-muted-foreground">Nothing fulfilled yet.</p>}
        <div className="flex flex-col divide-y">
          {fulfillments.map((f) => (
            <div key={f.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge>
                  {f.location && (
                    <span className="ml-2 text-xs text-muted-foreground">{f.location.name}</span>
                  )}
                  {f.trackingNumber && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {f.trackingCarrier ?? "Tracking"}: {f.trackingNumber}
                    </span>
                  )}
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    {f.status === "pending" && (
                      <Button type="button" size="sm" onClick={() => void onAction(f.id, "ship")}>
                        Mark shipped
                      </Button>
                    )}
                    {f.status === "shipped" && (
                      <Button type="button" size="sm" onClick={() => void onAction(f.id, "deliver")}>
                        Mark delivered
                      </Button>
                    )}
                    {(f.status === "pending" || f.status === "shipped") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelling(f.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ul className="text-xs text-muted-foreground">
                {f.items.map((i) => (
                  <li key={i.orderItemId}>
                    {i.quantity} × {i.title} {i.sku && `(${i.sku})`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>

      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => void onCancel()}
        title="Cancel this fulfillment?"
        description="Its units go back to reserved stock for this order."
        destructive
        pending={submit.pending}
      />

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Fulfil items"
        description="Ships from the store's default location."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="fulfil-form" loading={submit.pending}>
              Fulfil
            </Button>
          </>
        }
      >
        <form id="fulfil-form" onSubmit={(e) => void onCreate(e)} className="flex flex-col gap-3">
          {remaining.map((i) => {
            const left = i.quantity - i.fulfilledQuantity;
            return (
              <div key={i.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`qty-${i.id}`} className="min-w-0 flex-1 truncate">
                  {i.title} <span className="text-xs text-muted-foreground">({left} left)</span>
                </label>
                <Input
                  id={`qty-${i.id}`}
                  type="number"
                  min={0}
                  max={left}
                  className="w-20"
                  value={quantities[i.id] ?? ""}
                  onChange={(e) => setQuantities((q) => ({ ...q, [i.id]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            );
          })}
          <FormField id="ff-carrier" label="Carrier (optional)">
            <Input
              id="ff-carrier"
              value={trackingCarrier}
              onChange={(e) => setTrackingCarrier(e.target.value)}
              maxLength={120}
            />
          </FormField>
          <FormField id="ff-tracking" label="Tracking number (optional)">
            <Input
              id="ff-tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              maxLength={120}
            />
          </FormField>
        </form>
      </Dialog>
    </Card>
  );
}
