"use client";

import type {
  CompanyCandidate,
  CustomerCandidate,
  DraftOrderDetail,
  InventoryVariantCandidate,
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
  ConfirmDialog,
  Dialog,
  FormField,
  Input,
  TagInput,
  Textarea,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  AddressFields,
  addressToDraft,
  draftToAddress,
  isAddressBlank,
  type AddressDraft,
} from "@/components/address-fields";
import { CompanyPicker, LocationSelect, VariantPicker, variantLabel } from "@/components/pickers";
import { api, ApiClientError } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import { PRICE_SOURCE_LABEL } from "../order-badges";

interface LineDraft {
  variant: InventoryVariantCandidate;
  quantity: string;
  customPrice: string;
  // From the last server quote, for display.
  quoted?: DraftOrderDetail["items"][number];
}

// Create/edit a draft order. Every save re-quotes on the server; the editor only collects
// quantities, an optional custom price per line, the buyer and the addresses.
export function DraftOrderEditor({
  storeId,
  storeSlug,
  draft,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  draft: DraftOrderDetail | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const editable = canWrite && (draft === null || draft.status === "open");
  const [company, setCompany] = useState<CompanyCandidate | null>(
    draft?.buyer.company
      ? {
          id: draft.buyer.company.id,
          displayName: draft.buyer.company.displayName,
          legalName: draft.buyer.company.displayName,
          status: "active",
        }
      : null,
  );
  const [locationId, setLocationId] = useState(draft?.buyer.location?.id ?? "");
  const [customer, setCustomer] = useState<CustomerCandidate | null>(
    draft?.buyer.customer
      ? {
          id: draft.buyer.customer.id,
          email: draft.buyer.customer.email,
          displayName: draft.buyer.customer.displayName,
          status: "active",
        }
      : null,
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerCandidate[]>([]);
  const [email, setEmail] = useState(draft?.email ?? "");
  const [poNumber, setPoNumber] = useState(draft?.poNumber ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [tags, setTags] = useState<string[]>(draft?.tags ?? []);
  const [shipping, setShipping] = useState<AddressDraft>(addressToDraft(draft?.shippingAddress));
  const [lines, setLines] = useState<LineDraft[]>(
    draft?.items.map((i) => ({
      variant: {
        variantId: i.variantId,
        productId: i.productId ?? "",
        productTitle: i.title,
        variantTitle: i.variantTitle,
        sku: i.sku,
        tracked: i.available !== null,
      },
      quantity: String(i.quantity),
      customPrice: i.customUnitPrice ? minorToInput(i.customUnitPrice.amount) : "",
      quoted: i,
    })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [version, setVersion] = useState(draft?.version ?? 1);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      void api<{ data: CustomerCandidate[] }>(
        `/stores/${storeId}/customers/search?q=${encodeURIComponent(customerQuery)}&limit=10`,
      )
        .then((res) => setCustomerResults(res.data))
        .catch(() => setCustomerResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [customerQuery, storeId]);

  const payload = () => ({
    buyer: {
      customerId: customer?.id ?? null,
      companyId: locationId ? null : (company?.id ?? null),
      companyLocationId: locationId || null,
    },
    email: email.trim() || null,
    poNumber: poNumber.trim() || null,
    note: note.trim() || null,
    tags,
    shippingAddress: isAddressBlank(shipping) ? null : draftToAddress(shipping),
    items: lines.map((l) => ({
      variantId: l.variant.variantId,
      quantity: Math.max(1, Number(l.quantity) || 1),
      customUnitPrice: l.customPrice.trim() ? inputToMinor(l.customPrice) : null,
    })),
  });

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    const res = await submit.run(async () => {
      try {
        return draft
          ? await api<{ data: DraftOrderDetail }>(`/stores/${storeId}/draft-orders/${draft.id}`, {
              method: "PATCH",
              body: { ...payload(), version },
            })
          : await api<{ data: DraftOrderDetail }>(`/stores/${storeId}/draft-orders`, {
              body: payload(),
            });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict" && !err.fields.length)
          setConflict(true);
        throw err;
      }
    });
    if (!res) return;
    if (!draft) {
      router.push(`/${storeSlug}/orders/drafts/${res.data.id}`);
      return;
    }
    setVersion(res.data.version);
    router.refresh();
  }

  async function onComplete() {
    if (!draft) return;
    const res = await submit.run(() =>
      api<{ data: { orderId: string } }>(`/stores/${storeId}/draft-orders/${draft.id}/complete`, {
        body: {},
        headers: { "Idempotency-Key": `${draft.id}:${version}` },
      }),
    );
    if (res) router.push(`/${storeSlug}/orders/${res.data.orderId}`);
  }

  async function onCancel() {
    if (!draft) return;
    const res = await submit.run(() =>
      api(`/stores/${storeId}/draft-orders/${draft.id}/cancel`, { body: {} }),
    );
    if (res !== undefined) {
      setConfirmCancel(false);
      router.refresh();
    }
  }

  function addLine() {
    if (!variant) return;
    setLines((prev) => [
      ...prev.filter((l) => l.variant.variantId !== variant.variantId),
      { variant, quantity: "1", customPrice: "" },
    ]);
    setVariant(null);
    setPicking(false);
  }

  const dirtyHint =
    draft && draft.status === "open" ? "Save to re-quote prices and availability." : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/orders/drafts`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Draft orders
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            {draft ? draft.name : "New draft order"}
          </h1>
          {draft && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge
                variant={
                  draft.status === "open"
                    ? "default"
                    : draft.status === "completed"
                      ? "success"
                      : "secondary"
                }
              >
                {draft.status}
              </Badge>
              {draft.completedOrderId && (
                <Link
                  href={`/${storeSlug}/orders/${draft.completedOrderId}`}
                  className="hover:underline"
                >
                  Open the order →
                </Link>
              )}
              {draft.catalogRestricted && <span>· catalog-restricted buyer</span>}
            </div>
          )}
        </div>
        {editable && (
          <div className="flex gap-2">
            {draft && (
              <Button type="button" variant="ghost" onClick={() => setConfirmCancel(true)}>
                Discard draft
              </Button>
            )}
            <Button
              type="submit"
              form="draft-form"
              variant={draft ? "outline" : "primary"}
              loading={submit.pending}
            >
              {draft ? "Save draft" : "Create draft"}
            </Button>
            {draft && (
              <Button
                type="button"
                onClick={() => setConfirmComplete(true)}
                disabled={!draft.ready || submit.pending}
              >
                Complete order
              </Button>
            )}
          </div>
        )}
      </div>
      {conflict && (
        <Alert variant="warning" title="Someone else saved this draft">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {submit.error && !conflict && <Alert variant="error">{submit.error}</Alert>}
      {draft && draft.problems.length > 0 && draft.status === "open" && (
        <Alert variant="warning" title="This draft cannot be completed yet">
          <ul className="list-disc pl-4">
            {draft.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <form
        id="draft-form"
        onSubmit={(e) => void onSave(e)}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start"
      >
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Items</CardTitle>
                <CardDescription>
                  {dirtyHint ?? "Quoted for the chosen buyer when you save."}
                </CardDescription>
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
                  className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[1fr_6rem_8rem_auto] sm:items-end"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{variantLabel(l.variant)}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.variant.sku ?? "—"}
                      {l.quoted &&
                        ` · ${PRICE_SOURCE_LABEL[l.quoted.priceSource]} ${formatMoney(l.quoted.unitPrice)} · line ${formatMoney(l.quoted.lineTotal)}`}
                      {l.quoted?.available !== null &&
                        l.quoted?.available !== undefined &&
                        ` · ${l.quoted.available} available`}
                    </div>
                    {l.quoted?.problems.map((p) => (
                      <div key={p} className="text-xs text-destructive">
                        {p}
                      </div>
                    ))}
                  </div>
                  <FormField id={`qty-${i}`} label="Qty">
                    <Input
                      id={`qty-${i}`}
                      type="number"
                      min={1}
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, quantity: e.target.value } : x,
                          ),
                        )
                      }
                      disabled={!editable}
                    />
                  </FormField>
                  <FormField
                    id={`price-${i}`}
                    label="Custom price"
                    hint={l.customPrice ? undefined : "blank = quoted"}
                  >
                    <Input
                      id={`price-${i}`}
                      inputMode="decimal"
                      value={l.customPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x, idx) =>
                            idx === i ? { ...x, customPrice: e.target.value } : x,
                          ),
                        )
                      }
                      disabled={!editable}
                    />
                  </FormField>
                  {editable && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {draft && (
                <dl className="grid grid-cols-2 gap-1 pt-3 text-sm">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="text-right tabular-nums">{formatMoney(draft.totals.subtotal)}</dd>
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd className="text-right tabular-nums">
                    {formatMoney(draft.totals.shippingTotal)}
                  </dd>
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-right tabular-nums">{formatMoney(draft.totals.taxTotal)}</dd>
                  <dt className="font-medium">Total</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {formatMoney(draft.totals.total)}
                  </dd>
                </dl>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping address</CardTitle>
              <CardDescription>
                Optional for now; billing defaults to the same address.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddressFields
                idPrefix="d-ship"
                value={shipping}
                onChange={setShipping}
                errors={submit.fieldErrors}
                prefix="shippingAddress"
                disabled={!editable}
                required={false}
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Buyer</CardTitle>
              <CardDescription>
                Pick a company for B2B pricing, and a customer to attach the order to.
              </CardDescription>
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
                    error={submit.fieldErrors["buyer.companyId"]}
                  />
                  <LocationSelect
                    storeId={storeId}
                    companyId={company?.id ?? null}
                    value={locationId}
                    onChange={setLocationId}
                  />
                  <FormField
                    id="d-customer"
                    label="Customer"
                    error={submit.fieldErrors["buyer.customerId"]}
                  >
                    <Input
                      id="d-customer"
                      placeholder="Search customers"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                  </FormField>
                  {customer && (
                    <p className="text-sm">
                      Selected: <span className="font-medium">{customer.displayName}</span>{" "}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setCustomer(null)}
                      >
                        clear
                      </button>
                    </p>
                  )}
                  <div
                    role="listbox"
                    aria-label="Matching customers"
                    className="max-h-40 overflow-y-auto rounded-md border text-sm"
                  >
                    {customerResults.length === 0 && (
                      <p className="px-3 py-2 text-muted-foreground">No matching customers.</p>
                    )}
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={customer?.id === c.id}
                        onClick={() => setCustomer(c)}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent ${customer?.id === c.id ? "bg-accent font-medium" : ""}`}
                      >
                        <span>{c.displayName}</span>
                        <span className="text-xs text-muted-foreground">{c.email}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm">
                  <div className="font-medium">
                    {draft?.buyer.company?.displayName ??
                      draft?.buyer.customer?.displayName ??
                      draft?.email ??
                      "Guest"}
                  </div>
                  {draft?.buyer.location && (
                    <div className="text-muted-foreground">{draft.buyer.location.name}</div>
                  )}
                  {draft?.buyer.customer && (
                    <div className="text-muted-foreground">{draft.buyer.customer.email}</div>
                  )}
                </div>
              )}
              <FormField id="d-email" label="Contact email" error={submit.fieldErrors.email}>
                <Input
                  id="d-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!editable}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <FormField id="d-po" label="PO number" error={submit.fieldErrors.poNumber}>
                <Input
                  id="d-po"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  maxLength={80}
                  disabled={!editable}
                />
              </FormField>
              <FormField id="d-tags" label="Tags">
                <TagInput id="d-tags" value={tags} onChange={setTags} disabled={!editable} />
              </FormField>
              <FormField id="d-note" label="Note" error={submit.fieldErrors.note}>
                <Textarea
                  id="d-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  disabled={!editable}
                />
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
      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={onComplete}
        title={`Complete ${draft?.name ?? "draft"}?`}
        description="Creates a numbered order, reserves stock and locks these prices. Unsaved edits are not included."
        confirmLabel="Complete order"
        pending={submit.pending}
      />
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={onCancel}
        title={`Discard ${draft?.name ?? "draft"}?`}
        description="The draft is kept for reference but can no longer be completed."
        confirmLabel="Discard"
        destructive
        pending={submit.pending}
      />
    </div>
  );
}
