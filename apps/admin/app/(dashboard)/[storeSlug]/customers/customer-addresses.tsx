"use client";

import { formatAddressLines, type CustomerAddressSummary, type CustomerDetail } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Dialog,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import {
  AddressFields,
  addressToDraft,
  draftToAddress,
  emptyAddress,
  type AddressDraft,
} from "@/components/address-fields";
import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; address: CustomerAddressSummary } | null;

export function CustomerAddresses({
  storeId,
  customer,
  readOnly,
}: {
  storeId: string;
  customer: CustomerDetail;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CustomerAddressSummary | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/customers/${customer.id}/addresses`;

  async function mutate(fn: () => Promise<unknown>) {
    const ok = await action.run(fn);
    if (ok !== undefined) router.refresh();
    return ok !== undefined;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Addresses</CardTitle>
          <CardDescription>Shipping and billing addresses used at checkout.</CardDescription>
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing({ kind: "new" })}
          >
            Add address
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {action.error && <Alert variant="error">{action.error}</Alert>}
        {customer.addresses.length === 0 && (
          <p className="text-sm text-muted-foreground">No addresses yet.</p>
        )}
        {customer.addresses.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div>
              {formatAddressLines(a.address).map((line, i) => (
                <div key={i} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                  {line}
                </div>
              ))}
              {a.address.phone && <div className="text-muted-foreground">{a.address.phone}</div>}
              <div className="mt-1 flex gap-1">
                {a.isDefaultShipping && <Badge>Default shipping</Badge>}
                {a.isDefaultBilling && <Badge variant="secondary">Default billing</Badge>}
              </div>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", address: a })}
                >
                  Edit
                </Button>
                {!a.isDefaultShipping && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={action.pending}
                    onClick={() =>
                      void mutate(() =>
                        api(`${base}/${a.id}`, {
                          method: "PATCH",
                          body: { isDefaultShipping: true },
                        }),
                      )
                    }
                  >
                    Set shipping default
                  </Button>
                )}
                {!a.isDefaultBilling && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={action.pending}
                    onClick={() =>
                      void mutate(() =>
                        api(`${base}/${a.id}`, {
                          method: "PATCH",
                          body: { isDefaultBilling: true },
                        }),
                      )
                    }
                  >
                    Set billing default
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(a)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <AddressDialog
        base={base}
        editing={editing}
        isFirst={customer.addresses.length === 0}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this address?"
        description="If it was a default, the oldest remaining address takes over."
        confirmLabel="Delete"
        destructive
        pending={action.pending}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await mutate(() => api(`${base}/${deleting.id}`, { method: "DELETE" }));
          if (ok) setDeleting(null);
        }}
      />
    </Card>
  );
}

function AddressDialog({
  base,
  editing,
  isFirst,
  onClose,
  onSaved,
}: {
  base: string;
  editing: Editing;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.address : null;
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress());
  const [shipping, setShipping] = useState(false);
  const [billing, setBilling] = useState(false);

  useEffect(() => {
    reset();
    setDraft(current ? addressToDraft(current.address) : emptyAddress());
    setShipping(current?.isDefaultShipping ?? isFirst);
    setBilling(current?.isDefaultBilling ?? isFirst);
  }, [current, editing, isFirst, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const body = current
      ? {
          address: draftToAddress(draft),
          ...(shipping && !current.isDefaultShipping ? { isDefaultShipping: true } : {}),
          ...(billing && !current.isDefaultBilling ? { isDefaultBilling: true } : {}),
        }
      : { address: draftToAddress(draft), isDefaultShipping: shipping, isDefaultBilling: billing };
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
      title={current ? "Edit address" : "Add address"}
      className="max-w-xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="address-form" loading={submit.pending}>
            {current ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <form id="address-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <AddressFields
          idPrefix="addr"
          value={draft}
          onChange={setDraft}
          errors={submit.fieldErrors}
          prefix="address"
        />
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={shipping}
              disabled={current?.isDefaultShipping ?? false}
              onChange={(e) => setShipping(e.target.checked)}
            />
            Default shipping address
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={billing}
              disabled={current?.isDefaultBilling ?? false}
              onChange={(e) => setBilling(e.target.checked)}
            />
            Default billing address
          </label>
        </div>
      </form>
    </Dialog>
  );
}
