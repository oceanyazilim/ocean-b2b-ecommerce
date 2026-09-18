"use client";

import type { OrderItemSummary, ReturnResolution, ReturnSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  FormField,
  Input,
  Select,
  Textarea,
  type BadgeVariant,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<ReturnSummary["status"], BadgeVariant> = {
  requested: "warning",
  approved: "default",
  received: "default",
  closed: "success",
  declined: "secondary",
};

const RESOLUTIONS: { value: ReturnResolution; label: string }[] = [
  { value: "refund", label: "Refund" },
  { value: "exchange", label: "Exchange" },
  { value: "store_credit", label: "Store credit" },
  { value: "none", label: "None" },
];

export function ReturnsPanel({
  storeId,
  orderId,
  items,
  returns,
  canWrite,
}: {
  storeId: string;
  orderId: string;
  items: OrderItemSummary[];
  returns: ReturnSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const base = `/stores/${storeId}/orders/${orderId}`;
  const [requesting, setRequesting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<ReturnResolution>("refund");

  const returnable = items.filter((i) => i.refundedQuantity < i.quantity);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    const lines = returnable
      .map((i) => ({
        orderItemId: i.id,
        quantity: Number(quantities[i.id] ?? 0),
        restock: restock[i.id] ?? true,
      }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0 || !reason.trim()) return;
    const res = await submit.run(() =>
      api(`${base}/returns`, { body: { reason: reason.trim(), resolution, items: lines } }),
    );
    if (res !== undefined) {
      setRequesting(false);
      setQuantities({});
      setRestock({});
      setReason("");
      router.refresh();
    }
  }

  async function onAction(returnId: string, action: "approve" | "receive" | "close" | "decline") {
    const res = await submit.run(() => api(`${base}/returns/${returnId}/${action}`, { body: {} }));
    if (res !== undefined) router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Returns</CardTitle>
        {canWrite && returnable.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={() => setRequesting(true)}>
            Request return
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {returns.length === 0 && <p className="text-muted-foreground">No returns.</p>}
        <div className="flex flex-col divide-y">
          {returns.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">{r.reason}</span>
                </div>
                {canWrite && (
                  <div className="flex gap-2">
                    {r.status === "requested" && (
                      <>
                        <Button type="button" size="sm" onClick={() => void onAction(r.id, "approve")}>
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void onAction(r.id, "decline")}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                    {(r.status === "requested" || r.status === "approved") && (
                      <Button type="button" size="sm" onClick={() => void onAction(r.id, "receive")}>
                        Mark received
                      </Button>
                    )}
                    {r.status === "received" && (
                      <Button type="button" size="sm" onClick={() => void onAction(r.id, "close")}>
                        Close &amp; refund
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ul className="text-xs text-muted-foreground">
                {r.items.map((i) => (
                  <li key={i.orderItemId}>
                    {i.quantity} × {i.title} {i.sku && `(${i.sku})`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog
        open={requesting}
        onClose={() => setRequesting(false)}
        title="Request return"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRequesting(false)} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="return-form" loading={submit.pending}>
              Request
            </Button>
          </>
        }
      >
        <form id="return-form" onSubmit={(e) => void onRequest(e)} className="flex flex-col gap-3">
          {returnable.map((i) => {
            const left = i.quantity - i.refundedQuantity;
            return (
              <div key={i.id} className="flex items-center justify-between gap-3">
                <label htmlFor={`ret-qty-${i.id}`} className="min-w-0 flex-1 truncate">
                  {i.title} <span className="text-xs text-muted-foreground">({left} left)</span>
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Checkbox
                    checked={restock[i.id] ?? true}
                    onChange={(e) => setRestock((r) => ({ ...r, [i.id]: e.target.checked }))}
                  />
                  Restock
                </label>
                <Input
                  id={`ret-qty-${i.id}`}
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
          <FormField id="ret-resolution" label="Resolution">
            <Select
              id="ret-resolution"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as ReturnResolution)}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="ret-reason" label="Reason" error={submit.fieldErrors.reason}>
            <Textarea
              id="ret-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              required
            />
          </FormField>
        </form>
      </Dialog>
    </Card>
  );
}
