"use client";

import type {
  InventoryVariantCandidate,
  QuantityRuleScope,
  QuantityRuleSummary,
} from "@ocean/types";
import {
  Alert,
  Button,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { VariantPicker } from "@/components/pickers";
import { api } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; rule: QuantityRuleSummary } | null;

// Spec example: "Minimum 10, Increment 5, Maximum 500" — this renders the actual valid order
// quantities that combination produces (the same math carts/checkout enforce), so the effect of
// min/max/increment together is legible at a glance instead of three separate numbers.
function exampleQuantities(r: QuantityRuleSummary): string {
  const min = r.minQuantity ?? 1;
  const inc = r.increment && r.increment > 0 ? r.increment : 1;
  const max = r.maxQuantity;
  const shown: number[] = [];
  let v = min;
  while (shown.length < 4 && (max === null || v <= max)) {
    shown.push(v);
    v += inc;
  }
  if (shown.length === 0) return "—";
  const more = max !== null && v <= max;
  return shown.join(", ") + (more ? `, … ${max}` : "");
}

export function QuantityRules({
  storeId,
  rules,
  canWrite,
}: {
  storeId: string;
  rules: QuantityRuleSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<QuantityRuleSummary | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/pricing/quantity-rules`;

  const columns: DataGridColumn<QuantityRuleSummary>[] = [
    {
      key: "scope",
      header: "Applies to",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.scopeLabel}</div>
          <div className="text-xs capitalize text-muted-foreground">{r.scope}</div>
        </div>
      ),
    },
    {
      key: "min",
      header: "Minimum",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.minQuantity ?? "—"}</span>,
    },
    {
      key: "max",
      header: "Maximum",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.maxQuantity ?? "—"}</span>,
    },
    {
      key: "inc",
      header: "Increment",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.increment ?? "—"}</span>,
    },
    {
      key: "example",
      header: "Valid quantities",
      cell: (r) => <span className="tabular-nums text-muted-foreground">{exampleQuantities(r)}</span>,
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r: QuantityRuleSummary) => (
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", rule: r })}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<QuantityRuleSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Minimum, maximum and increment per product or variant. A variant rule overrides its
          product&apos;s rule. Carts and checkout enforce these.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>New rule</Button>}
      </div>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rules}
        rowKey={(r) => r.id}
        empty={{
          title: "No quantity rules yet",
          description: "Example: minimum 10, increment 5, maximum 500.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add first rule</Button>
          ) : undefined,
        }}
      />
      <RuleDialog
        storeId={storeId}
        base={base}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Remove the rule for ${deleting?.scopeLabel ?? "this item"}?`}
        confirmLabel="Remove"
        destructive
        pending={action.pending}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await action.run(() => api(`${base}/${deleting.id}`, { method: "DELETE" }));
          if (ok !== undefined) {
            setDeleting(null);
            router.refresh();
          }
        }}
      />
    </div>
  );
}

function RuleDialog({
  storeId,
  base,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  base: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.rule : null;
  const [scope, setScope] = useState<QuantityRuleScope>("product");
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [increment, setIncrement] = useState("");

  useEffect(() => {
    reset();
    setScope(current?.scope ?? "product");
    setVariant(null);
    setMin(current?.minQuantity?.toString() ?? "");
    setMax(current?.maxQuantity?.toString() ?? "");
    setIncrement(current?.increment?.toString() ?? "");
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const scopeId = current
      ? current.scopeId
      : scope === "variant"
        ? variant?.variantId
        : variant?.productId;
    if (!scopeId) return;
    const num = (v: string) => (v.trim() ? Number(v) : null);
    const res = await submit.run(() =>
      api(base, {
        method: "PUT",
        body: {
          scope: current?.scope ?? scope,
          scopeId,
          minQuantity: num(min),
          maxQuantity: num(max),
          increment: num(increment),
        },
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
      title={current ? `Quantity rule · ${current.scopeLabel}` : "New quantity rule"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="quantity-rule-form"
            loading={submit.pending}
            disabled={!current && !variant}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="quantity-rule-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-3"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {!current && (
          <>
            <FormField id="qr-scope" label="Applies to">
              <Select
                id="qr-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as QuantityRuleScope)}
              >
                <option value="product">One product (all variants)</option>
                <option value="variant">One variant</option>
              </Select>
            </FormField>
            <VariantPicker
              storeId={storeId}
              value={variant}
              onChange={setVariant}
              label={scope === "variant" ? "Variant" : "Pick any variant of the product"}
              error={submit.fieldErrors.scopeId}
            />
          </>
        )}
        <div className="grid grid-cols-3 gap-3">
          <FormField id="qr-min" label="Minimum" error={submit.fieldErrors.minQuantity}>
            <Input
              id="qr-min"
              type="number"
              min={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </FormField>
          <FormField id="qr-max" label="Maximum" error={submit.fieldErrors.maxQuantity}>
            <Input
              id="qr-max"
              type="number"
              min={1}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </FormField>
          <FormField id="qr-inc" label="Increment" error={submit.fieldErrors.increment}>
            <Input
              id="qr-inc"
              type="number"
              min={1}
              value={increment}
              onChange={(e) => setIncrement(e.target.value)}
            />
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
