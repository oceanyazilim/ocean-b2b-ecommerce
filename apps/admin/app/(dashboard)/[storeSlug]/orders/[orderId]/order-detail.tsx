"use client";

import { formatAddressLines, type OrderDetail } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  FormField,
  Input,
  TagInput,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import {
  FulfillmentStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PRICE_SOURCE_LABEL,
} from "../order-badges";

const EVENT_LABEL: Record<string, string> = {
  "order.created": "Order placed",
  "order.updated": "Order edited",
  "order.note": "Note",
  "order.cancelled": "Order cancelled",
};

export function OrderDetailView({
  storeId,
  storeSlug,
  order,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  order: OrderDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const [note, setNote] = useState(order.note ?? "");
  const [poNumber, setPoNumber] = useState(order.poNumber ?? "");
  const [tags, setTags] = useState<string[]>(order.tags);
  const [version, setVersion] = useState(order.version);
  const [comment, setComment] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const base = `/stores/${storeId}/orders/${order.id}`;
  const open = order.status !== "cancelled" && order.status !== "completed";

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    setSaved(false);
    const res = await submit.run(async () => {
      try {
        return await api<{ data: OrderDetail }>(base, {
          method: "PATCH",
          body: { version, note: note.trim() || null, poNumber: poNumber.trim() || null, tags },
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict" && !err.fields.length)
          setConflict(true);
        throw err;
      }
    });
    if (res) {
      setVersion(res.data.version);
      setSaved(true);
      router.refresh();
    }
  }

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    const res = await submit.run(() => api(`${base}/notes`, { body: { message: comment.trim() } }));
    if (res !== undefined) {
      setComment("");
      router.refresh();
    }
  }

  async function onCancel(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() => api(`${base}/cancel`, { body: { reason, restock: true } }));
    if (res !== undefined) {
      setCancelling(false);
      router.refresh();
    }
  }

  const buyerName =
    order.buyer.company?.displayName ?? order.buyer.customer?.displayName ?? order.email ?? "Guest";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/orders`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Orders
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{order.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
            <FulfillmentStatusBadge status={order.fulfillmentStatus} />
            <span>· {new Date(order.createdAt).toLocaleString()}</span>
            <span>· via {order.source.replace("_", " ")}</span>
            {order.placedBy && <span>· by {order.placedBy.name}</span>}
          </div>
        </div>
        {canWrite && open && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setCancelling(true)}>
              Cancel order
            </Button>
            <Button type="submit" form="order-form" loading={submit.pending}>
              Save
            </Button>
          </div>
        )}
      </div>
      {conflict && (
        <Alert variant="warning" title="Someone else saved this order">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {submit.error && !conflict && <Alert variant="error">{submit.error}</Alert>}
      {saved && <Alert variant="success">Saved.</Alert>}
      {order.status === "cancelled" && (
        <Alert variant="warning" title="Cancelled">
          {order.cancelReason} ·{" "}
          {order.cancelledAt ? new Date(order.cancelledAt).toLocaleString() : ""}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <CardDescription>
                Prices as quoted at the moment the order was placed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {order.items.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  {i.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={i.image.url}
                      alt={i.image.alt ?? ""}
                      className="h-10 w-10 rounded border object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded border bg-muted" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {i.productId ? (
                        <Link
                          href={`/${storeSlug}/products/${i.productId}`}
                          className="hover:underline"
                        >
                          {i.title}
                        </Link>
                      ) : (
                        i.title
                      )}
                      {i.variantTitle !== "Default Title" && (
                        <span className="text-muted-foreground"> · {i.variantTitle}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.sku ?? "—"} · {PRICE_SOURCE_LABEL[i.priceSource]}
                      {i.reservations.length > 0 &&
                        ` · reserved at ${i.reservations.map((r) => `${r.locationName} (${r.quantity})`).join(", ")}`}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div>
                      {i.quantity} × {formatMoney(i.unitPrice)}
                    </div>
                    <div className="font-medium">{formatMoney(i.lineTotal)}</div>
                  </div>
                </div>
              ))}
              <dl className="grid grid-cols-2 gap-1 pt-3 text-sm">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.totals.subtotal)}</dd>
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="text-right tabular-nums">
                  {formatMoney(order.totals.shippingTotal)}
                </dd>
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.totals.taxTotal)}</dd>
                <dt className="font-medium">Total</dt>
                <dd className="text-right font-semibold tabular-nums">
                  {formatMoney(order.totals.total)}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ol className="flex flex-col gap-3 text-sm">
                {order.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                    <div>
                      <div>
                        <span className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</span>
                        {e.actor && (
                          <span className="text-muted-foreground"> · {e.actor.name}</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}
                          · {new Date(e.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {typeof e.payload.message === "string" && (
                        <p className="whitespace-pre-wrap">{e.payload.message}</p>
                      )}
                      {typeof e.payload.reason === "string" && (
                        <p className="text-muted-foreground">{e.payload.reason}</p>
                      )}
                      {Array.isArray(e.payload.fields) && (
                        <p className="text-xs text-muted-foreground">
                          {(e.payload.fields as string[]).join(", ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {canWrite && (
                <form onSubmit={(e) => void onComment(e)} className="flex gap-2">
                  <Input
                    placeholder="Leave an internal note"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    maxLength={2000}
                    aria-label="Internal note"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    loading={submit.pending}
                    disabled={!comment.trim()}
                  >
                    Post
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="font-medium">{buyerName}</div>
              {order.buyer.company && (
                <Link
                  href={`/${storeSlug}/companies/${order.buyer.company.id}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  Company · {order.buyer.location?.name ?? "all locations"}
                </Link>
              )}
              {order.buyer.customer && (
                <Link
                  href={`/${storeSlug}/customers/${order.buyer.customer.id}`}
                  className="hover:underline"
                >
                  {order.buyer.customer.displayName} · {order.buyer.customer.email}
                </Link>
              )}
              {!order.buyer.customer && order.email && <div>{order.email}</div>}
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Shipping address</div>
                  {order.shippingAddress ? (
                    formatAddressLines(order.shippingAddress).map((l, i) => <div key={i}>{l}</div>)
                  ) : (
                    <div>—</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Billing address</div>
                  {order.billingAddress ? (
                    formatAddressLines(order.billingAddress).map((l, i) => <div key={i}>{l}</div>)
                  ) : (
                    <div>—</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <form id="order-form" onSubmit={(e) => void onSave(e)}>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField id="o-po" label="PO number" error={submit.fieldErrors.poNumber}>
                  <Input
                    id="o-po"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    maxLength={80}
                    disabled={!canWrite || !open}
                  />
                </FormField>
                <FormField id="o-tags" label="Tags" error={submit.fieldErrors.tags}>
                  <TagInput
                    id="o-tags"
                    value={tags}
                    onChange={setTags}
                    disabled={!canWrite || !open}
                  />
                </FormField>
                <FormField id="o-note" label="Order note" error={submit.fieldErrors.note}>
                  <Textarea
                    id="o-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={2000}
                    disabled={!canWrite || !open}
                  />
                </FormField>
                {order.draftOrderId && (
                  <Link
                    href={`/${storeSlug}/orders/drafts/${order.draftOrderId}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Created from a draft order →
                  </Link>
                )}
              </CardContent>
            </Card>
          </form>
        </div>
      </div>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${order.name}?`}
        description="Reserved stock is released and the buyer's totals are reverted. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelling(false)} disabled={submit.pending}>
              Keep order
            </Button>
            <Button
              type="submit"
              form="cancel-form"
              variant="destructive"
              loading={submit.pending}
              disabled={!reason.trim()}
            >
              Cancel order
            </Button>
          </>
        }
      >
        <form id="cancel-form" onSubmit={(e) => void onCancel(e)}>
          <FormField id="cancel-reason" label="Reason" error={submit.fieldErrors.reason}>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={500}
              autoFocus
            />
          </FormField>
        </form>
      </Dialog>
      <Badge className="hidden" />
    </div>
  );
}
