"use client";

import type {
  CompanyCandidate,
  CustomerCandidate,
  InventoryVariantCandidate,
  QuoteDetail,
  QuoteStatus,
} from "@ocean/types";
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
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { CompanyPicker, CustomerPicker, LocationSelect, VariantPicker, variantLabel } from "@/components/pickers";
import { api } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

interface LineDraft {
  variant: InventoryVariantCandidate;
  quantity: string;
  unitPrice: string;
  discount: string;
}

const STATUS_VARIANT: Record<QuoteStatus, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  sent: "default",
  accepted: "success",
  declined: "destructive",
  expired: "warning",
  converted: "success",
};

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
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {quote ? quote.number : "New quote"}{" "}
            {quote && <Badge variant={STATUS_VARIANT[quote.status]}>{quote.status}</Badge>}
          </h1>
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
