"use client";

import { formatAddressLines, type CompanyDetail, type CompanyLocationSummary } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  AddressFields,
  addressToDraft,
  draftToAddress,
  emptyAddress,
  isAddressBlank,
  type AddressDraft,
} from "@/components/address-fields";
import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; location: CompanyLocationSummary } | null;

export function CompanyLocations({
  storeId,
  company,
  canWrite,
}: {
  storeId: string;
  company: CompanyDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CompanyLocationSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/companies/${company.id}/locations`;
  const rows = company.locations;

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) router.refresh();
    return ok !== undefined;
  }

  const columns: DataGridColumn<CompanyLocationSummary>[] = [
    {
      key: "name",
      header: "Location",
      cell: (l) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{l.name}</span>
            {l.isDefault && <Badge>Default</Badge>}
            {!l.isActive && <Badge variant="secondary">Inactive</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatAddressLines(l.shippingAddress).slice(0, 3).join(", ")}
          </div>
        </div>
      ),
    },
    {
      key: "billing",
      header: "Billing",
      cell: (l) => (
        <span className="text-muted-foreground">
          {l.billingAddress ? formatAddressLines(l.billingAddress).slice(0, 2).join(", ") : "Same as shipping"}
        </span>
      ),
    },
    {
      key: "tax",
      header: "Tax",
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          {l.taxExempt && <Badge variant="warning">Exempt</Badge>}
          {l.taxNumber && <span className="text-xs text-muted-foreground">{l.taxNumber}</span>}
          {!l.taxExempt && !l.taxNumber && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: "currency",
      header: "Currency",
      cell: (l) => l.currency ?? <span className="text-muted-foreground">{company.currency}</span>,
    },
    {
      key: "users",
      header: "Buyers",
      className: "text-right",
      cell: (l) => <span className="tabular-nums">{l.userCount}</span>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (l: CompanyLocationSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", location: l })}>
                  Edit
                </Button>
                {!l.isDefault && l.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === l.id}
                    onClick={() => void mutate(l.id, () => api(`${base}/${l.id}/default`, { body: {} }))}
                  >
                    Make default
                  </Button>
                )}
                {!l.isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busyId === l.id}
                    onClick={() =>
                      void mutate(l.id, () =>
                        api(`${base}/${l.id}`, { method: "PATCH", body: { isActive: !l.isActive } }),
                      )
                    }
                  >
                    {l.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )}
                {(!l.isDefault || rows.length === 1) && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                    Delete
                  </Button>
                )}
              </div>
            ),
          } satisfies DataGridColumn<CompanyLocationSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Branches and ship-to sites. Catalogs, price lists, payment terms and credit attach per
          location in later phases.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add location</Button>}
      </div>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        empty={{
          title: "No locations yet",
          description: "Add the head office or first branch so buyers have somewhere to ship to.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add first location</Button>
          ) : undefined,
        }}
      />
      <LocationDialog
        base={base}
        companyCurrency={company.currency}
        editing={editing}
        isFirst={rows.length === 0}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "location"}?`}
        description="Buyers assigned only to this location lose their assignment."
        confirmLabel="Delete"
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await mutate(deleting.id, () =>
            api(`${base}/${deleting.id}`, { method: "DELETE" }),
          );
          if (ok) setDeleting(null);
        }}
      />
    </div>
  );
}

function LocationDialog({
  base,
  companyCurrency,
  editing,
  isFirst,
  onClose,
  onSaved,
}: {
  base: string;
  companyCurrency: string;
  editing: Editing;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.location : null;
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [shipping, setShipping] = useState<AddressDraft>(emptyAddress());
  const [separateBilling, setSeparateBilling] = useState(false);
  const [billing, setBilling] = useState<AddressDraft>(emptyAddress());
  const [currency, setCurrency] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [taxNumber, setTaxNumber] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [note, setNote] = useState("");

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setExternalId(current?.externalId ?? "");
    setPhone(current?.phone ?? "");
    setEmail(current?.email ?? "");
    setShipping(addressToDraft(current?.shippingAddress));
    setSeparateBilling(!!current?.billingAddress);
    setBilling(addressToDraft(current?.billingAddress));
    setCurrency(current?.currency ?? "");
    setTaxExempt(current?.taxExempt ?? false);
    setTaxNumber(current?.taxNumber ?? "");
    setIsDefault(current?.isDefault ?? isFirst);
    setIsActive(current?.isActive ?? true);
    setNote(current?.note ?? "");
  }, [current, editing, isFirst, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const orNull = (v: string) => (v.trim() ? v.trim() : null);
    const body = {
      name,
      externalId: orNull(externalId),
      phone: orNull(phone),
      email: orNull(email),
      shippingAddress: draftToAddress(shipping),
      billingAddress: separateBilling && !isAddressBlank(billing) ? draftToAddress(billing) : null,
      currency: currency.trim() ? currency.trim().toUpperCase() : null,
      taxExempt,
      taxNumber: orNull(taxNumber),
      isDefault,
      isActive,
      note: orNull(note),
    };
    const res = await submit.run(() =>
      current ? api(`${base}/${current.id}`, { method: "PATCH", body }) : api(base, { body }),
    );
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={current ? "Edit location" : "Add location"}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="company-location-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form
        id="company-location-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField id="cl-name" label="Name" error={submit.fieldErrors.name}>
            <Input
              id="cl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              invalid={!!submit.fieldErrors.name}
              autoFocus
            />
          </FormField>
          <FormField id="cl-external" label="External ID" error={submit.fieldErrors.externalId}>
            <Input
              id="cl-external"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              maxLength={80}
            />
          </FormField>
          <FormField id="cl-email" label="Email" error={submit.fieldErrors.email}>
            <Input
              id="cl-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              invalid={!!submit.fieldErrors.email}
            />
          </FormField>
          <FormField id="cl-phone" label="Phone" error={submit.fieldErrors.phone}>
            <Input id="cl-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </FormField>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Shipping address</legend>
          <AddressFields
            idPrefix="cl-ship"
            value={shipping}
            onChange={setShipping}
            errors={submit.fieldErrors}
            prefix="shippingAddress"
            showName={false}
          />
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={separateBilling} onChange={(e) => setSeparateBilling(e.target.checked)} />
          Use a different billing address
        </label>
        {separateBilling && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Billing address</legend>
            <AddressFields
              idPrefix="cl-bill"
              value={billing}
              onChange={setBilling}
              errors={submit.fieldErrors}
              prefix="billingAddress"
              showName={false}
            />
          </fieldset>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            id="cl-currency"
            label="Currency"
            hint={`Blank = company currency (${companyCurrency})`}
            error={submit.fieldErrors.currency}
          >
            <Input
              id="cl-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              invalid={!!submit.fieldErrors.currency}
            />
          </FormField>
          <FormField id="cl-tax" label="Location tax number" error={submit.fieldErrors.taxNumber}>
            <Input id="cl-tax" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} maxLength={40} />
          </FormField>
        </div>
        <FormField id="cl-note" label="Note" error={submit.fieldErrors.note}>
          <Textarea id="cl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </FormField>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={taxExempt} onChange={(e) => setTaxExempt(e.target.checked)} />
            Tax exempt at this location
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={isDefault}
              disabled={current?.isDefault ?? false}
              onChange={(e) => {
                setIsDefault(e.target.checked);
                if (e.target.checked) setIsActive(true);
              }}
            />
            Default location
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={isActive} disabled={isDefault} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          {(submit.fieldErrors.isActive ?? submit.fieldErrors.isDefault) && (
            <p role="alert" className="text-xs text-destructive">
              {submit.fieldErrors.isActive ?? submit.fieldErrors.isDefault}
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
