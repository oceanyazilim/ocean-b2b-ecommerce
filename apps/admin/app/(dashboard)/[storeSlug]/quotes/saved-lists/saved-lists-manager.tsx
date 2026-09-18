"use client";

import type { CompanyCandidate, CustomerCandidate, InventoryVariantCandidate, SavedListSummary } from "@ocean/types";
import { Alert, Button, Card, CardContent, ConfirmDialog, Dialog, FormField, Input, type DataGridColumn, DataGrid } from "@ocean/ui";
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";

import { CompanyPicker, CustomerPicker, VariantPicker, variantLabel } from "@/components/pickers";
import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

export function SavedListsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<SavedListSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SavedListSummary | null>(null);
  const action = useSubmit();
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: SavedListSummary[] }>(`/stores/${storeId}/saved-lists`);
      setRows(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: DataGridColumn<SavedListSummary>[] = [
    { key: "name", header: "List", cell: (l) => <span className="font-medium">{l.name}</span> },
    { key: "owner", header: "Owner", cell: (l) => (l.customerId ? "Customer" : l.companyId ? "Company" : "—") },
    { key: "items", header: "Items", className: "text-right", cell: (l) => l.itemCount },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (l: SavedListSummary) => (
              <Button size="sm" variant="ghost" onClick={() => setDeleting(l)}>
                Delete
              </Button>
            ),
          } satisfies DataGridColumn<SavedListSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Reusable quick-order lists for a customer or company.</p>
        {canWrite && <Button onClick={() => setCreating(true)}>Add list</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        loading={loading}
        empty={{
          title: "No saved lists yet",
          action: canWrite ? <Button onClick={() => setCreating(true)}>Add your first list</Button> : undefined,
        }}
      />
      <CreateListDialog storeId={storeId} open={creating} onClose={() => setCreating(false)} onSaved={() => void load()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this list"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          setBusyId(deleting.id);
          const ok = await action.run(() => api(`/stores/${storeId}/saved-lists/${deleting.id}`, { method: "DELETE" }));
          setBusyId(null);
          if (ok !== undefined) await load();
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CreateListDialog({
  storeId,
  open,
  onClose,
  onSaved,
}: {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [ownerKind, setOwnerKind] = useState<"customer" | "company">("customer");
  const [customer, setCustomer] = useState<CustomerCandidate | null>(null);
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [items, setItems] = useState<{ variant: InventoryVariantCandidate; quantity: string }[]>([]);
  const [picking, setPicking] = useState(false);
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);

  useEffect(() => {
    if (open) {
      reset();
      setName("");
      setOwnerKind("customer");
      setCustomer(null);
      setCompany(null);
      setItems([]);
    }
  }, [open, reset]);

  function addItem() {
    if (!variant) return;
    setItems((prev) => [...prev.filter((i) => i.variant.variantId !== variant.variantId), { variant, quantity: "1" }]);
    setVariant(null);
    setPicking(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      customerId: ownerKind === "customer" ? (customer?.id ?? null) : null,
      companyId: ownerKind === "company" ? (company?.id ?? null) : null,
      items: items.map((i) => ({ variantId: i.variant.variantId, quantity: Math.max(1, Number(i.quantity) || 1) })),
    };
    const res = await submit.run(() => api(`/stores/${storeId}/saved-lists`, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Fragment>
      <Dialog
        open={open}
        onClose={onClose}
        title="Add saved list"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
              Cancel
            </Button>
            <Button type="submit" form="list-form" loading={submit.pending}>
              Create
            </Button>
          </>
        }
      >
      <form id="list-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="list-name" label="Name" error={submit.fieldErrors.name}>
          <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </FormField>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={ownerKind === "customer"} onChange={() => setOwnerKind("customer")} />
            Customer
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={ownerKind === "company"} onChange={() => setOwnerKind("company")} />
            Company
          </label>
        </div>
        {ownerKind === "customer" ? (
          <CustomerPicker storeId={storeId} value={customer} onChange={setCustomer} />
        ) : (
          <CompanyPicker storeId={storeId} value={company} onChange={setCompany} />
        )}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Items</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setPicking(true)}>
              Add item
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items yet.</p>
          ) : (
            <Card>
              <CardContent className="flex flex-col divide-y py-0">
                {items.map((it, i) => (
                  <div key={it.variant.variantId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{variantLabel(it.variant)}</span>
                    <Input
                      type="number"
                      min={1}
                      className="w-16"
                      value={it.quantity}
                      onChange={(e) => setItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantity: e.target.value } : x)))}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                      Remove
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </form>
      </Dialog>

      <Dialog
        open={picking}
        onClose={() => setPicking(false)}
        title="Add an item"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPicking(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={addItem} disabled={!variant}>
              Add
            </Button>
          </>
        }
      >
        <VariantPicker storeId={storeId} value={variant} onChange={setVariant} />
      </Dialog>
    </Fragment>
  );
}
