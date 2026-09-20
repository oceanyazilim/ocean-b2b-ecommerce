"use client";

import type { TaxClassSummary, TaxRuleSummary } from "@ocean/types";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { useSubmit } from "@/lib/use-submit";

type Editing = { kind: "new" } | { kind: "edit"; rule: TaxRuleSummary } | null;

export function TaxesManager({
  storeId,
  pricesIncludeTax: initialInclusive,
  canWrite,
}: {
  storeId: string;
  pricesIncludeTax: boolean;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<TaxRuleSummary[]>([]);
  const [taxClasses, setTaxClasses] = useState<TaxClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TaxRuleSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inclusive, setInclusive] = useState(initialInclusive);
  const action = useSubmit();
  const settingsSubmit = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rules, classes] = await Promise.all([
        api<{ data: TaxRuleSummary[] }>(`/stores/${storeId}/tax/rules`),
        api<{ data: TaxClassSummary[] }>(`/stores/${storeId}/tax/classes`),
      ]);
      setRows(rules.data);
      setTaxClasses(classes.data);
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

  async function onToggleInclusive(next: boolean) {
    setInclusive(next);
    await settingsSubmit.run(() =>
      api(`/stores/${storeId}/tax/settings`, { method: "PUT", body: { pricesIncludeTax: next } }),
    );
  }

  const columns: DataGridColumn<TaxRuleSummary>[] = [
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "region",
      header: "Region",
      cell: (r) => (r.provinceCode ? `${r.provinceCode}, ${r.countryCode}` : r.countryCode),
    },
    {
      key: "taxClass",
      header: "Tax class",
      cell: (r) => r.taxClassName ?? <span className="text-muted-foreground">Every class</span>,
    },
    {
      key: "rate",
      header: "Rate",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{r.ratePercent}%</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (r.isActive ? "Active" : "Inactive"),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r: TaxRuleSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", rule: r })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<TaxRuleSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tax settings</CardTitle>
          <CardDescription>
            Whether product prices already include tax, or tax is added on top at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={inclusive}
              disabled={!canWrite || settingsSubmit.pending}
              onChange={(e) => void onToggleInclusive(e.target.checked)}
            />
            Prices include tax
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          The most specific active rule for the buyer&apos;s address wins — a province rule beats a
          country-wide one.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add tax rule</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        empty={{
          title: "No tax rules yet",
          description: "Add one so orders from that region are taxed correctly.",
          action: canWrite ? (
            <Button onClick={() => setEditing({ kind: "new" })}>Add your first rule</Button>
          ) : undefined,
        }}
      />
      <RuleDialog
        storeId={storeId}
        editing={editing}
        taxClasses={taxClasses}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this rule"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () => api(`/stores/${storeId}/tax/rules/${deleting.id}`, { method: "DELETE" }));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RuleDialog({
  storeId,
  editing,
  taxClasses,
  onClose,
  onSaved,
}: {
  storeId: string;
  editing: Editing;
  taxClasses: TaxClassSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [provinceCode, setProvinceCode] = useState("");
  const [taxClassId, setTaxClassId] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [isActive, setIsActive] = useState(true);
  const current = editing?.kind === "edit" ? editing.rule : null;

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setCountryCode(current?.countryCode ?? "");
    setProvinceCode(current?.provinceCode ?? "");
    setTaxClassId(current?.taxClassId ?? "");
    setRatePercent(current ? String(current.ratePercent) : "");
    setIsActive(current?.isActive ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const rateBps = Math.round((Number(ratePercent.replace(",", ".")) || 0) * 100);
    const body = {
      name,
      countryCode: countryCode.trim().toUpperCase(),
      provinceCode: provinceCode.trim() ? provinceCode.trim().toUpperCase() : null,
      taxClassId: taxClassId || null,
      rateBps,
      isActive,
    };
    const res = await submit.run(() =>
      current
        ? api(`/stores/${storeId}/tax/rules/${current.id}`, { method: "PATCH", body })
        : api(`/stores/${storeId}/tax/rules`, { body }),
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
      title={current ? "Edit tax rule" : "Add tax rule"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="tax-rule-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="tax-rule-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="tax-name" label="Name" error={submit.fieldErrors.name}>
          <Input
            id="tax-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="tax-country" label="Country code" error={submit.fieldErrors.countryCode}>
            <Input
              id="tax-country"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              required
              maxLength={2}
              placeholder="TR"
            />
          </FormField>
          <FormField id="tax-province" label="Province code (optional)">
            <Input
              id="tax-province"
              value={provinceCode}
              onChange={(e) => setProvinceCode(e.target.value)}
              maxLength={10}
            />
          </FormField>
        </div>
        <FormField
          id="tax-class"
          label="Tax class (optional)"
          hint="Leave unset to apply to every tax class at this geography."
        >
          <Select id="tax-class" value={taxClassId} onChange={(e) => setTaxClassId(e.target.value)}>
            <option value="">Every class</option>
            {taxClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="tax-rate" label="Rate (%)" error={submit.fieldErrors.rateBps}>
          <Input
            id="tax-rate"
            inputMode="decimal"
            value={ratePercent}
            onChange={(e) => setRatePercent(e.target.value)}
            placeholder="18"
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </Dialog>
  );
}
