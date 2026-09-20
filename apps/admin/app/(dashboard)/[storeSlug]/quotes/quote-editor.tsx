"use client";

import type {
  CompanyCandidate,
  CustomerCandidate,
  InventoryVariantCandidate,
  QuoteDetail,
} from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  FormField,
  Input,
  Select,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CompanyPicker, CustomerPicker, LocationSelect, VariantPicker, variantLabel } from "@/components/pickers";
import { api } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import { formatPaymentTerms, QuoteStatusBadge } from "./quote-badges";

interface LineDraft {
  variant: InventoryVariantCandidate;
  quantity: string;
  unitPrice: string;
  discount: string;
}

// The real PaymentTermsType enum (packages/db/prisma/schema.prisma) has four values: immediate,
// net, deposit, scheduled. There is no dedicated "payment term presets" API/UI in this codebase
// (PaymentTermsTemplate is a real table but has no controller yet — Phase 12 didn't build one),
// so presets here are just UI shortcuts that write the real Quote.paymentTerms JSON field through
// the existing create/update quote endpoints — nothing new is persisted server-side.
type PaymentTermsKind = "immediate" | "net" | "deposit" | "scheduled";

interface PaymentTermsDraft {
  type: PaymentTermsKind;
  netDays: string;
  depositPercent: string;
  remainderNetDays: string;
  notes: string;
}

const NET_PRESETS = [7, 15, 30, 45, 60, 90];

function draftFromTerms(terms: Record<string, unknown>): PaymentTermsDraft {
  const type: PaymentTermsKind =
    terms.type === "net" || terms.type === "deposit" || terms.type === "scheduled"
      ? terms.type
      : "immediate";
  return {
    type,
    netDays: typeof terms.netDays === "number" ? String(terms.netDays) : "30",
    depositPercent: typeof terms.depositPercent === "number" ? String(terms.depositPercent) : "20",
    remainderNetDays:
      typeof terms.remainderNetDays === "number" ? String(terms.remainderNetDays) : "30",
    notes: typeof terms.notes === "string" ? terms.notes : "",
  };
}

function termsFromDraft(d: PaymentTermsDraft): Record<string, unknown> {
  switch (d.type) {
    case "immediate":
      return { type: "immediate" };
    case "net":
      return { type: "net", netDays: Number(d.netDays) || 30 };
    case "deposit":
      return {
        type: "deposit",
        depositPercent: Math.min(100, Math.max(0, Number(d.depositPercent) || 0)),
        remainderNetDays: Number(d.remainderNetDays) || 0,
      };
    case "scheduled":
      return { type: "scheduled", notes: d.notes.trim() || null };
  }
}

export function QuoteEditor({
  storeId,
  storeSlug,
  quote,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  quote: QuoteDetail | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const lifecycleAction = useSubmit();
  const editable = canWrite && (quote === null || quote.status === "draft");

  const [company, setCompany] = useState<CompanyCandidate | null>(
    quote ? { id: quote.companyId, displayName: quote.companyName, legalName: quote.companyName, status: "active" } : null,
  );
  const [locationId, setLocationId] = useState(quote?.companyLocationId ?? "");
  const [customer, setCustomer] = useState<CustomerCandidate | null>(
    quote ? { id: quote.customerId, email: "", displayName: "Current buyer", status: "active" } : null,
  );
  const [currency, setCurrency] = useState(quote?.currency ?? "TRY");
  const [expiresAt, setExpiresAt] = useState(quote?.expiresAt ? quote.expiresAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(quote?.internalNotes ?? "");
  const [paymentTerms, setPaymentTerms] = useState<PaymentTermsDraft>(
    draftFromTerms(quote?.paymentTerms ?? {}),
  );
  const [lines, setLines] = useState<LineDraft[]>(
    quote?.items.map((i) => ({
      variant: { variantId: i.variantId, productId: "", productTitle: i.title, variantTitle: "", sku: i.sku, tracked: false },
      quantity: String(i.quantity),
      unitPrice: minorToInput(i.unitPrice.amount),
      discount: minorToInput(i.discount.amount),
    })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  function addLine() {
    if (!variant) return;
    setLines((prev) => [
      ...prev.filter((l) => l.variant.variantId !== variant.variantId),
      { variant, quantity: "1", unitPrice: "", discount: "0" },
    ]);
    setVariant(null);
    setPicking(false);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const body = {
      companyId: company?.id,
      companyLocationId: locationId || null,
      customerId: customer?.id,
      currency,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      notes: notes.trim() || null,
      internalNotes: internalNotes.trim() || null,
      paymentTerms: termsFromDraft(paymentTerms),
      items: lines.map((l) => ({
        variantId: l.variant.variantId,
        quantity: Math.max(1, Number(l.quantity) || 1),
        unitPrice: inputToMinor(l.unitPrice) ?? 0,
        discount: inputToMinor(l.discount) ?? 0,
      })),
    };
    const res = await submit.run(() =>
      quote
        ? api<{ data: QuoteDetail }>(`/stores/${storeId}/quotes/${quote.id}`, { method: "PATCH", body })
        : api<{ data: QuoteDetail }>(`/stores/${storeId}/quotes`, { body }),
    );
    if (!res) return;
    if (!quote) {
      router.push(`/${storeSlug}/quotes/${res.data.id}`);
    } else {
      router.refresh();
    }
  }

  async function transition(action: "send" | "accept" | "expire" | "convert") {
    if (!quote) return;
    const res = await lifecycleAction.run(() =>
      api<{ data: { orderId?: string } }>(`/stores/${storeId}/quotes/${quote.id}/${action}`, { method: "POST", body: {} }),
    );
    if (res === undefined) return;
    if (action === "convert" && res.data.orderId) {
      router.push(`/${storeSlug}/orders/${res.data.orderId}`);
      return;
    }
    router.refresh();
  }

  async function onDecline() {
    if (!quote) return;
    const res = await lifecycleAction.run(() =>
      api(`/stores/${storeId}/quotes/${quote.id}/decline`, {
        method: "POST",
        body: { reason: declineReason.trim() || null },
      }),
    );
    if (res !== undefined) {
      setDeclining(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/${storeSlug}/quotes`} className="text-sm text-muted-foreground hover:underline">
            ← Quotes
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {quote ? quote.number : "New quote"}
            {quote && <QuoteStatusBadge status={quote.status} />}
          </h1>
          {quote && (
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(quote.createdAt).toLocaleString()}
              {quote.expiresAt && ` · expires ${new Date(quote.expiresAt).toLocaleDateString()}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button type="submit" form="quote-form" loading={submit.pending}>
              {quote ? "Save" : "Create quote"}
            </Button>
          )}
          {quote && canWrite && quote.status === "draft" && (
            <Button variant="outline" loading={lifecycleAction.pending} onClick={() => void transition("send")}>
              Send to buyer
            </Button>
          )}
          {quote && canWrite && quote.status === "sent" && (
            <>
              <Button variant="outline" loading={lifecycleAction.pending} onClick={() => void transition("accept")}>
                Mark accepted
              </Button>
              <Button variant="ghost" onClick={() => setDeclining(true)}>
                Decline
              </Button>
              <Button variant="ghost" loading={lifecycleAction.pending} onClick={() => void transition("expire")}>
                Expire
              </Button>
            </>
          )}
          {quote && canWrite && quote.status === "accepted" && (
            <Button loading={lifecycleAction.pending} onClick={() => void transition("convert")}>
              Convert to order
            </Button>
          )}
        </div>
      </div>
      {quote?.convertedOrderId && (
        <Alert variant="success">
          Converted.{" "}
          <Link href={`/${storeSlug}/orders/${quote.convertedOrderId}`} className="underline">
            Open the order →
          </Link>
        </Alert>
      )}
      {submit.error && <Alert variant="error">{submit.error}</Alert>}
      {lifecycleAction.error && <Alert variant="error">{lifecycleAction.error}</Alert>}

      <form id="quote-form" onSubmit={(e) => void onSave(e)} className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Items</CardTitle>
                <CardDescription>Negotiated prices — enter what you're offering the buyer.</CardDescription>
              </div>
              {editable && (
                <Button type="button" size="sm" variant="outline" onClick={() => setPicking(true)}>
                  Add item
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {lines.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
              {lines.map((l, i) => (
                <div
                  key={l.variant.variantId}
                  className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[1fr_5rem_7rem_7rem_auto] sm:items-end"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{l.variant.productTitle ? variantLabel(l.variant) : l.variant.sku}</div>
                    <div className="text-xs text-muted-foreground">{l.variant.sku ?? "—"}</div>
                  </div>
                  <FormField id={`q-qty-${i}`} label="Qty">
                    <Input
                      id={`q-qty-${i}`}
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
                      disabled={!editable}
                    />
                  </FormField>
                  <FormField id={`q-price-${i}`} label="Unit price">
                    <Input
                      id={`q-price-${i}`}
                      inputMode="decimal"
                      value={l.unitPrice}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, unitPrice: e.target.value } : x)))}
                      disabled={!editable}
                    />
                  </FormField>
                  <FormField id={`q-disc-${i}`} label="Discount">
                    <Input
                      id={`q-disc-${i}`}
                      inputMode="decimal"
                      value={l.discount}
                      onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, discount: e.target.value } : x)))}
                      disabled={!editable}
                    />
                  </FormField>
                  {editable && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {quote && (
                <dl className="grid grid-cols-2 gap-1 pt-3 text-sm">
                  <dt className="font-medium">Total</dt>
                  <dd className="text-right font-semibold tabular-nums">{formatMoney(quote.total)}</dd>
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {editable ? (
                <>
                  <CompanyPicker
                    storeId={storeId}
                    value={company}
                    onChange={(c) => {
                      setCompany(c);
                      setLocationId("");
                    }}
                    error={submit.fieldErrors.companyId}
                  />
                  <LocationSelect storeId={storeId} companyId={company?.id ?? null} value={locationId} onChange={setLocationId} />
                  <CustomerPicker storeId={storeId} value={customer} onChange={setCustomer} error={submit.fieldErrors.customerId} />
                </>
              ) : (
                <div className="text-sm">
                  <div className="font-medium">{quote?.companyName}</div>
                </div>
              )}
              <FormField id="q-currency" label="Currency" error={submit.fieldErrors.currency}>
                <Input id="q-currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} disabled={!editable} />
              </FormField>
              <FormField id="q-expires" label="Expires" error={submit.fieldErrors.expiresAt}>
                <Input id="q-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} disabled={!editable} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment terms</CardTitle>
              <CardDescription>
                {editable
                  ? "How the buyer pays once this converts to an order."
                  : formatPaymentTerms(quote?.paymentTerms)}
              </CardDescription>
            </CardHeader>
            {editable && (
              <CardContent className="flex flex-col gap-3">
                <FormField id="q-terms-type" label="Terms">
                  <Select
                    id="q-terms-type"
                    value={paymentTerms.type}
                    onChange={(e) =>
                      setPaymentTerms((p) => ({ ...p, type: e.target.value as PaymentTermsKind }))
                    }
                  >
                    <option value="immediate">Due immediately</option>
                    <option value="net">Net (custom)</option>
                    <option value="deposit">Deposit + Net</option>
                    <option value="scheduled">Scheduled</option>
                  </Select>
                </FormField>
                {paymentTerms.type === "net" && (
                  <>
                    <div className="flex flex-wrap gap-1">
                      {NET_PRESETS.map((days) => (
                        <Button
                          key={days}
                          type="button"
                          size="sm"
                          variant={Number(paymentTerms.netDays) === days ? "primary" : "outline"}
                          onClick={() => setPaymentTerms((p) => ({ ...p, netDays: String(days) }))}
                        >
                          Net {days}
                        </Button>
                      ))}
                    </div>
                    <FormField id="q-net-days" label="Net days (custom)">
                      <Input
                        id="q-net-days"
                        type="number"
                        min={1}
                        max={365}
                        value={paymentTerms.netDays}
                        onChange={(e) => setPaymentTerms((p) => ({ ...p, netDays: e.target.value }))}
                      />
                    </FormField>
                  </>
                )}
                {paymentTerms.type === "deposit" && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField id="q-deposit-pct" label="Deposit %" hint="e.g. 20">
                      <Input
                        id="q-deposit-pct"
                        type="number"
                        min={1}
                        max={100}
                        value={paymentTerms.depositPercent}
                        onChange={(e) =>
                          setPaymentTerms((p) => ({ ...p, depositPercent: e.target.value }))
                        }
                      />
                    </FormField>
                    <FormField id="q-deposit-net" label="Remainder — Net days" hint="e.g. 30">
                      <Input
                        id="q-deposit-net"
                        type="number"
                        min={0}
                        max={365}
                        value={paymentTerms.remainderNetDays}
                        onChange={(e) =>
                          setPaymentTerms((p) => ({ ...p, remainderNetDays: e.target.value }))
                        }
                      />
                    </FormField>
                    {paymentTerms.depositPercent && paymentTerms.remainderNetDays && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        {formatPaymentTerms(termsFromDraft(paymentTerms))}
                      </p>
                    )}
                  </div>
                )}
                {paymentTerms.type === "scheduled" && (
                  <FormField id="q-terms-notes" label="Schedule notes" hint="No fixed schedule shape yet — free text">
                    <Textarea
                      id="q-terms-notes"
                      rows={2}
                      value={paymentTerms.notes}
                      onChange={(e) => setPaymentTerms((p) => ({ ...p, notes: e.target.value }))}
                      maxLength={500}
                    />
                  </FormField>
                )}
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <FormField id="q-notes" label="Notes to buyer">
                <Textarea id="q-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} />
              </FormField>
              <FormField id="q-internal" label="Internal notes">
                <Textarea id="q-internal" rows={3} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} disabled={!editable} />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </form>

      <Dialog
        open={picking}
        onClose={() => setPicking(false)}
        title="Add an item"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPicking(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={addLine} disabled={!variant}>
              Add
            </Button>
          </>
        }
      >
        <VariantPicker storeId={storeId} value={variant} onChange={setVariant} />
      </Dialog>

      <Dialog
        open={declining}
        onClose={() => setDeclining(false)}
        title="Decline this quote?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeclining(false)} disabled={lifecycleAction.pending}>
              Cancel
            </Button>
            <Button variant="destructive" loading={lifecycleAction.pending} onClick={() => void onDecline()}>
              Decline
            </Button>
          </>
        }
      >
        <FormField id="q-decline-reason" label="Reason (optional)">
          <Textarea id="q-decline-reason" rows={2} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />
        </FormField>
      </Dialog>
    </div>
  );
}
