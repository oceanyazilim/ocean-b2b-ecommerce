"use client";

import type { TaxClassSummary } from "@ocean/types";
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
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; cls: TaxClassSummary } | null;

// Spec section 24: "Products should support tax categories ... Build a tax-category system that
// can be mapped to the active tax engine." The list auto-seeds sensible defaults (Standard,
// Digital services, Food, Books, Clothing, Medical products, Tax exempt) on first read — see
// TaxService.ensureDefaultTaxClasses — so it's never empty on a store that hasn't touched this
// feature yet.
export function TaxClassesManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<TaxClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TaxClassSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: TaxClassSummary[] }>(`/stores/${storeId}/tax/classes`);
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

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<TaxClassSummary>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", header: "Code", cell: (r) => <code className="text-xs">{r.code}</code> },
    {
      key: "flags",
      header: "",
      cell: (r) => (
        <div className="flex gap-1">
          {r.isDefault && <Badge variant="info">Default</Badge>}
          {r.isSystem && <Badge variant="secondary">Built-in</Badge>}
        </div>
      ),
    },
    {
      key: "products",
      header: "Products",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.productCount}</span>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r: TaxClassSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", cls: r })}>
                  Edit
                </Button>
                {!r.isSystem && (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                    Delete
                  </Button>
                )}
              </div>
            ),
          } satisfies DataGridColumn<TaxClassSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tax classes products can be assigned to. Tax rules can optionally target one class
          instead of applying to every product — unassigned products behave as{" "}
          <strong>Standard</strong>.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add tax class</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        empty={{ title: "No tax classes yet", description: "Add one to get started." }}
      />
      <ClassDialog
        storeId={storeId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this tax class"}?`}
        description={
          deleting && deleting.productCount > 0
            ? "Reassign the products using this tax class first."
            : undefined
        }
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () =>
            api(`/stores/${storeId}/tax/classes/${deleting.id}`, { method: "DELETE" }),
          );
          setDeleting(null);
        }}
      />
    </div>
  );
}

function ClassDialog({
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const current = editing?.kind === "edit" ? editing.cls : null;

  useEffect(() => {
    reset();
    setCode(current?.code ?? "");
    setName(current?.name ?? "");
    setDescription(current?.description ?? "");
    setIsDefault(current?.isDefault ?? false);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/tax/classes/${current.id}`, {
            method: "PATCH",
            body: { name, description: description || null, isDefault },
          })
        : api(`/stores/${storeId}/tax/classes`, {
            body: { code, name, description: description || null, isDefault },
          }),
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
      title={current ? "Edit tax class" : "Add tax class"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="tax-class-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="tax-class-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {!current && (
          <FormField
            id="class-code"
            label="Code"
            hint="Lowercase, letters/numbers/underscores. Can't be changed later."
            error={submit.fieldErrors.code}
          >
            <Input
              id="class-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              maxLength={60}
              placeholder="digital_services"
              autoFocus
            />
          </FormField>
        )}
        <FormField id="class-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="class-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </FormField>
        <FormField id="class-description" label="Description (optional)">
          <Textarea
            id="class-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Default class for products without one assigned
        </label>
      </form>
    </Dialog>
  );
}
