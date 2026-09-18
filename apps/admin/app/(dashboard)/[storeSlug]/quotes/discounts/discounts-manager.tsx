"use client";

import type { DiscountSummary, DiscountType, DiscountMethod } from "@ocean/types";
import { Alert, Badge, Button, DataGrid, Dialog, FormField, Input, Select, type DataGridColumn } from "@ocean/ui";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { inputToMinor } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<DiscountSummary["status"], "secondary" | "success" | "warning"> = {
  scheduled: "secondary",
  active: "success",
  expired: "warning",
};

export function DiscountsManager({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const [rows, setRows] = useState<DiscountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const action = useSubmit();

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<{ data: DiscountSummary[] }>(`/stores/${storeId}/discounts`);
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

  async function remove(id: string) {
    const ok = await action.run(() => api(`/stores/${storeId}/discounts/${id}`, { method: "DELETE" }));
    if (ok !== undefined) await load();
  }

  const columns: DataGridColumn<DiscountSummary>[] = [
    {
      key: "value",
      header: "Discount",
      cell: (d) => (
        <span className="font-medium">
          {d.type === "percentage" ? `${d.value.percent}%` : d.type === "fixed_amount" ? `${(d.value.amount ?? 0) / 100} off` : "Free shipping"}
        </span>
      ),
    },
    { key: "method", header: "Method", cell: (d) => (d.method === "code" ? d.codes.join(", ") || "—" : "Automatic") },
    { key: "status", header: "Status", cell: (d) => <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge> },
    { key: "usage", header: "Used", className: "text-right", cell: (d) => `${d.usageCount}${d.usageLimit ? ` / ${d.usageLimit}` : ""}` },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (d: DiscountSummary) => (
              <Button size="sm" variant="ghost" onClick={() => void remove(d.id)}>
                Delete
              </Button>
            ),
          } satisfies DataGridColumn<DiscountSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Discounts here are validated by <code className="rounded bg-muted px-1">validate-code</code>; wiring into
          checkout pricing is a later pass.
        </p>
        {canWrite && <Button onClick={() => setCreating(true)}>Add discount</Button>}
      </div>
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        empty={{
          title: "No discounts yet",
          action: canWrite ? <Button onClick={() => setCreating(true)}>Add your first discount</Button> : undefined,
        }}
      />
      <CreateDiscountDialog storeId={storeId} open={creating} onClose={() => setCreating(false)} onSaved={() => void load()} />
    </div>
  );
}

function CreateDiscountDialog({
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
  const [type, setType] = useState<DiscountType>("percentage");
  const [method, setMethod] = useState<DiscountMethod>("code");
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");
  const [usageLimit, setUsageLimit] = useState("");

  useEffect(() => {
    if (open) {
      reset();
      setType("percentage");
      setMethod("code");
      setCode("");
      setPercent("");
      setAmount("");
      setMinSubtotal("");
      setStartsAt(new Date().toISOString().slice(0, 10));
      setEndsAt("");
      setUsageLimit("");
    }
  }, [open, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      type,
      method,
      value: {
        percent: type === "percentage" ? Number(percent) || 0 : undefined,
        amount: type === "fixed_amount" ? (inputToMinor(amount) ?? 0) : undefined,
      },
      conditions: minSubtotal.trim() ? { minSubtotal: inputToMinor(minSubtotal) ?? 0 } : {},
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
      code: method === "code" ? code.trim().toUpperCase() : undefined,
    };
    const res = await submit.run(() => api(`/stores/${storeId}/discounts`, { body }));
    if (res !== undefined) {
      onSaved();
      onClose();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add discount"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="discount-form" loading={submit.pending}>
            Create
          </Button>
        </>
      }
    >
      <form id="discount-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="disc-type" label="Type">
          <Select id="disc-type" value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Fixed amount off</option>
            <option value="free_shipping">Free shipping</option>
          </Select>
        </FormField>
        <FormField id="disc-method" label="Method">
          <Select id="disc-method" value={method} onChange={(e) => setMethod(e.target.value as DiscountMethod)}>
            <option value="code">Code (buyer enters it)</option>
            <option value="automatic">Automatic</option>
          </Select>
        </FormField>
        {method === "code" && (
          <FormField id="disc-code" label="Code" error={submit.fieldErrors.code}>
            <Input id="disc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={50} />
          </FormField>
        )}
        {type === "percentage" && (
          <FormField id="disc-percent" label="Percent off" error={submit.fieldErrors["value.percent"]}>
            <Input id="disc-percent" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} required />
          </FormField>
        )}
        {type === "fixed_amount" && (
          <FormField id="disc-amount" label="Amount off" error={submit.fieldErrors["value.amount"]}>
            <Input id="disc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
        )}
        <FormField id="disc-min-subtotal" label="Minimum subtotal (optional)">
          <Input id="disc-min-subtotal" inputMode="decimal" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
        </FormField>
        <FormField id="disc-starts" label="Starts">
          <Input id="disc-starts" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </FormField>
        <FormField id="disc-ends" label="Ends (optional)">
          <Input id="disc-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </FormField>
        <FormField id="disc-usage-limit" label="Usage limit (optional)">
          <Input id="disc-usage-limit" type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
        </FormField>
      </form>
    </Dialog>
  );
}
