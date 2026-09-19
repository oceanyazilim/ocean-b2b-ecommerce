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
  ChevronDownIcon,
  Dialog,
  FormField,
  Input,
  TagInput,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { api, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import {
  FulfillmentStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
  PRICE_SOURCE_LABEL,
} from "../order-badges";
import { FulfillmentsPanel } from "./fulfillments-panel";
import { PaymentsPanel } from "./payments-panel";
import { ReturnsPanel } from "./returns-panel";

const EVENT_LABEL: Record<string, string> = {
  "order.created": "Order placed",
  "order.updated": "Order edited",
  "order.note": "Note",
  "order.cancelled": "Order cancelled",
};

const SOURCE_LABEL: Record<string, string> = {
  storefront: "Online store",
  draft_order: "Draft order",
  quote: "Quote",
  admin: "Placed by staff",
  api: "API",
};

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OrderDetailView({
  storeId,
  storeSlug,
  order,
  canWrite,
  canRefund,
  canManageFulfillments,
  canManageReturns,
}: {
  storeId: string;
  storeSlug: string;
  order: OrderDetail;
  canWrite: boolean;
  canRefund: boolean;
  canManageFulfillments: boolean;
  canManageReturns: boolean;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const base = `/stores/${storeId}/orders/${order.id}`;
  const open = order.status !== "cancelled" && order.status !== "completed";
  const hasCapturedPayment = order.payments.some((p) => p.status === "captured");

  useEffect(() => {
    if (!moreOpen) return;
    function onClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

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
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRefund && hasCapturedPayment && (
            <Button type="button" variant="outline" onClick={() => scrollTo("payments-panel")}>
              Refund
            </Button>
          )}
          {canWrite && open && (
            <Button type="button" variant="outline" onClick={() => scrollTo("order-details-card")}>
              Edit
            </Button>
          )}
          {canWrite && open && (
            <Button type="submit" form="order-form" loading={submit.pending}>
              Save
            </Button>
          )}
          {canWrite && (
            <div className="relative" ref={moreRef}>
              <Button type="button" variant="ghost" onClick={() => setMoreOpen((v) => !v)}>
                More
                <ChevronDownIcon size={14} />
              </Button>
              {moreOpen && (
                <div className="absolute right-0 z-10 mt-1 w-44 rounded-md border bg-card py-1 shadow-md">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setMoreOpen(false);
                      window.print();
                    }}
                  >
                    Print order
                  </button>
                  {open && (
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm text-destructive hover:bg-accent"
                      onClick={() => {
                        setMoreOpen(false);
                        setCancelling(true);
                      }}
                    >
                      Cancel order
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
              <div className="hidden grid-cols-[1fr_repeat(4,auto)] gap-3 pb-2 text-xs font-medium text-muted-foreground sm:grid">
                <span>Product</span>
                <span className="text-right">Quantity</span>
                <span className="text-right">Price</span>
                <span className="text-right">Discount</span>
                <span className="text-right">Total</span>
              </div>
              {order.items.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-3 py-3 text-sm sm:grid sm:grid-cols-[1fr_repeat(4,auto)] sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:flex-none">
                    {i.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.image.url}
                        alt={i.image.alt ?? ""}
                        className="h-10 w-10 shrink-0 rounded border object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded border bg-muted" aria-hidden />
                    )}
                    <div className="min-w-0">
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
                  </div>
                  <span className="text-right tabular-nums text-xs text-muted-foreground sm:text-sm sm:text-foreground">
                    {i.quantity}
                  </span>
                  <span className="text-right tabular-nums">{formatMoney(i.unitPrice)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {i.discount.amount > 0 ? `-${formatMoney(i.discount)}` : "—"}
                  </span>
                  <span className="text-right tabular-nums font-medium">
                    {formatMoney(i.lineTotal)}
                  </span>
                </div>
              ))}
              <dl className="grid grid-cols-2 gap-1 pt-3 text-sm">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="text-right tabular-nums">{formatMoney(order.totals.subtotal)}</dd>
                {order.totals.discountTotal.amount > 0 && (
                  <>
                    <dt className="text-muted-foreground">Discount</dt>
                    <dd className="text-right tabular-nums">
                      -{formatMoney(order.totals.discountTotal)}
                    </dd>
                  </>
                )}
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

          <div id="payments-panel">
            <PaymentsPanel
              storeId={storeId}
              orderId={order.id}
              payments={order.payments}
              refunds={order.refunds}
              canManagePayments={canWrite}
              canRefund={canRefund}
            />
          </div>
          <FulfillmentsPanel
            storeId={storeId}
            orderId={order.id}
            items={order.items}
            fulfillments={order.fulfillments}
            canWrite={canManageFulfillments}
          />
          <ReturnsPanel
            storeId={storeId}
            orderId={order.id}
            items={order.items}
            returns={order.returns}
            canWrite={canManageReturns}
          />
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{order.buyer.company ? "Company" : "Customer"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="font-medium">{buyerName}</div>
              {order.buyer.company && (
                <Link
                  href={`/${storeSlug}/companies/${order.buyer.company.id}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {order.buyer.location?.name ?? "All locations"} →
                </Link>
              )}
              {order.buyer.customer && (
                <Link
                  href={`/${storeSlug}/customers/${order.buyer.customer.id}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {order.buyer.customer.email} →
                </Link>
              )}
              {!order.buyer.customer && order.email && (
                <div className="text-xs text-muted-foreground">{order.email}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping &amp; billing</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {order.payments.length === 0 && (
                <p className="text-muted-foreground">No payment recorded yet.</p>
              )}
              {order.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span>{p.methodName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatMoney(p.amount)}
                  </span>
                </div>
              ))}
              {order.refunds.length > 0 && (
                <div className="flex items-center justify-between gap-2 border-t pt-2 text-muted-foreground">
                  <span>Refunded</span>
                  <span className="tabular-nums">
                    {formatMoney({
                      amount: order.refunds.reduce((s, r) => s + r.amount.amount, 0),
                      currency: order.currency,
                    })}
                  </span>
                </div>
              )}
              <button
                type="button"
                className="text-left text-xs text-muted-foreground hover:underline"
                onClick={() => scrollTo("payments-panel")}
              >
                Manage payments &amp; refunds ↓
              </button>
            </CardContent>
          </Card>

          <Card id="order-details-card">
            <CardHeader>
              <CardTitle>Order details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-1">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="text-right">{SOURCE_LABEL[order.source] ?? order.source}</dd>
                {order.placedBy && (
                  <>
                    <dt className="text-muted-foreground">Placed by</dt>
                    <dd className="text-right">{order.placedBy.name}</dd>
                  </>
                )}
                {order.draftOrderId && (
                  <>
                    <dt className="text-muted-foreground">Draft order</dt>
                    <dd className="text-right">
                      <Link
                        href={`/${storeSlug}/orders/drafts/${order.draftOrderId}`}
                        className="hover:underline"
                      >
                        View →
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
              <form id="order-form" onSubmit={(e) => void onSave(e)} className="flex flex-col gap-3">
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
              </form>
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
