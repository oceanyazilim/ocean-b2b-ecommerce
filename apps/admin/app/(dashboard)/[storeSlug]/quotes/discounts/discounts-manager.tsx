"use client";

import type { DiscountSummary, DiscountType, DiscountMethod } from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { api, errorMessage } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const STATUS_VARIANT: Record<DiscountSummary["status"], "secondary" | "success" | "warning"> = {
  scheduled: "secondary",
  active: "success",
  expired: "warning",
};

const TYPE_LABEL: Record<DiscountType, string> = {
  percentage: "Percentage",
  fixed_amount: "Fixed amount",
  free_shipping: "Free shipping",
};

function discountValueLabel(d: Pick<DiscountSummary, "type" | "value">, currency: string): string {
  if (d.type === "percentage") return `${d.value.percent ?? 0}% off`;
  if (d.type === "fixed_amount") return `${formatMoney({ amount: d.value.amount ?? 0, currency })} off`;
  return "Free shipping";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function DiscountsManager({
  storeId,
  currency,
  canWrite,
}: {
  storeId: string;
  currency: string;
  canWrite: boolean;
}) {
  const [rows, setRows] = useState<DiscountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DiscountSummary | null>(null);
  const [deleting, setDeleting] = useState<DiscountSummary | null>(null);
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

  const stats = useMemo(() => {
    const active = rows.filter((d) => d.status === "active").length;
    const scheduled = rows.filter((d) => d.status === "scheduled").length;
    const expired = rows.filter((d) => d.status === "expired").length;
    const redemptions = rows.reduce((sum, d) => sum + d.usageCount, 0);
    return { active, scheduled, expired, redemptions };
  }, [rows]);

  async function confirmDelete() {
    if (!deleting) return;
    const ok = await action.run(() => api(`/stores/${storeId}/discounts/${deleting.id}`, { method: "DELETE" }));
    if (ok !== undefined) {
      setDeleting(null);
      await load();
    }
  }

  const columns: DataGridColumn<DiscountSummary>[] = [
    {
      key: "value",
      header: "Discount",
      cell: (d) => (
        <div className="flex flex-col">
          <span className="font-medium">{discountValueLabel(d, currency)}</span>
          <span className="text-xs text-muted-foreground">{TYPE_LABEL[d.type]}</span>
        </div>
      ),
    },
    {
      key: "method",
      header: "Applies via",
      cell: (d) =>
        d.method === "code" ? (
          <div className="flex flex-wrap gap-1">
            {d.codes.length > 0 ? (
              d.codes.map((code) => (
                <code key={code} className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                  {code}
                </code>
              ))
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ) : (
          <Badge variant="outline">Automatic</Badge>
        ),
    },
    {
      key: "conditions",
      header: "Minimum order",
      cell: (d) =>
        d.conditions.minSubtotal !== undefined ? (
          formatMoney({ amount: d.conditions.minSubtotal, currency })
        ) : (
          <span className="text-muted-foreground">None</span>
        ),
    },
    {
      key: "schedule",
      header: "Schedule",
      cell: (d) => (
        <span className="text-muted-foreground">
          {formatDate(d.startsAt)} {d.endsAt ? `– ${formatDate(d.endsAt)}` : "→ no end date"}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (d) => <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge> },
    {
      key: "usage",
      header: "Redeemed",
      className: "text-right",
      cell: (d) => (
        <span className="tabular-nums">
          {d.usageCount}
          {d.usageLimit ? ` / ${d.usageLimit}` : ""}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (d: DiscountSummary) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(d)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<DiscountSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Discounts</h2>
          <p className="text-sm text-muted-foreground">
            Percentage, fixed-amount, and free-shipping discounts, redeemed by code or applied automatically.
          </p>
        </div>
        {canWrite && <Button onClick={() => setCreating(true)}>Add discount</Button>}
      </div>

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Active" value={String(stats.active)} />
          <StatCard label="Scheduled" value={String(stats.scheduled)} />
          <StatCard label="Expired" value={String(stats.expired)} />
          <StatCard label="Total redemptions" value={String(stats.redemptions)} />
        </div>
      )}

      <Alert variant="info">
        Discount codes are validated on demand via <code className="rounded bg-muted px-1">validate-code</code>, but
        aren&apos;t yet applied automatically to order totals during checkout — that pricing integration is a later
        pass. Conditions here support a minimum order subtotal only; there&apos;s no eligibility scoping by customer,
        company, or catalog, and no compound IF/AND rule builder in this data model yet.
      </Alert>

      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        loading={loading}
        empty={{
          title: "No discounts yet",
          description: "Create a percentage, fixed-amount, or free-shipping discount to get started.",
          action: canWrite ? <Button onClick={() => setCreating(true)}>Add your first discount</Button> : undefined,
        }}
      />

      <DiscountDialog
        storeId={storeId}
        currency={currency}
        mode="create"
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => void load()}
      />
      <DiscountDialog
        storeId={storeId}
        currency={currency}
        mode="edit"
        discount={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="Delete discount?"
        description={
          deleting
            ? `"${deleting.method === "code" ? deleting.codes.join(", ") || "This discount" : discountValueLabel(deleting, currency)}" will stop applying immediately. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        pending={action.pending}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

type DialogMode = { mode: "create" } | { mode: "edit"; discount: DiscountSummary | null };

function DiscountDialog(
  props: {
    storeId: string;
    currency: string;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
  } & DialogMode,
) {
  const { storeId, currency, open, onClose, onSaved } = props;
  const isEdit = props.mode === "edit";
  const discount = props.mode === "edit" ? props.discount : null;
  const formId = isEdit ? "discount-form-edit" : "discount-form-create";
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
    if (!open) return;
    reset();
    if (isEdit && discount) {
      setType(discount.type);
      setMethod(discount.method);
      setCode(discount.codes[0] ?? "");
      setPercent(discount.value.percent !== undefined ? String(discount.value.percent) : "");
      setAmount(minorToInput(discount.value.amount));
      setMinSubtotal(minorToInput(discount.conditions.minSubtotal));
      setStartsAt(discount.startsAt.slice(0, 10));
      setEndsAt(discount.endsAt ? discount.endsAt.slice(0, 10) : "");
      setUsageLimit(discount.usageLimit ? String(discount.usageLimit) : "");
    } else {
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
  }, [open, isEdit, discount, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = {
      percent: type === "percentage" ? Number(percent) || 0 : undefined,
      amount: type === "fixed_amount" ? (inputToMinor(amount) ?? 0) : undefined,
    };
    const conditions = minSubtotal.trim() ? { minSubtotal: inputToMinor(minSubtotal) ?? 0 } : {};
    if (isEdit && discount) {
      const body = {
        value,
        conditions,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
      };
      const res = await submit.run(() => api(`/stores/${storeId}/discounts/${discount.id}`, { method: "PATCH", body }));
      if (res !== undefined) {
        onSaved();
        onClose();
      }
      return;
    }
    const body = {
      type,
      method,
      value,
      conditions,
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
      title={isEdit ? "Edit discount" : "Add discount"}
      description={
        isEdit
          ? "Type, redemption method, and code are fixed once a discount is created — delete and recreate it to change those."
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={submit.pending}>
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}

        <FormField id="disc-type" label="Type">
          <Select
            id="disc-type"
            value={type}
            onChange={(e) => setType(e.target.value as DiscountType)}
            disabled={isEdit}
          >
            <option value="percentage">Percentage off</option>
            <option value="fixed_amount">Fixed amount off</option>
            <option value="free_shipping">Free shipping</option>
          </Select>
        </FormField>

        <FormField id="disc-method" label="Redemption method">
          <Select
            id="disc-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as DiscountMethod)}
            disabled={isEdit}
          >
            <option value="code">Code (buyer enters it)</option>
            <option value="automatic">Automatic</option>
          </Select>
        </FormField>

        {method === "code" && (
          <FormField id="disc-code" label="Code" error={submit.fieldErrors.code}>
            <Input
              id="disc-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              maxLength={50}
              disabled={isEdit}
            />
          </FormField>
        )}

        {type === "percentage" && (
          <FormField id="disc-percent" label="Percent off" error={submit.fieldErrors["value.percent"]}>
            <Input
              id="disc-percent"
              type="number"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
            />
          </FormField>
        )}
        {type === "fixed_amount" && (
          <FormField id="disc-amount" label={`Amount off (${currency})`} error={submit.fieldErrors["value.amount"]}>
            <Input id="disc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </FormField>
        )}

        <FormField
          id="disc-min-subtotal"
          label={`Minimum order subtotal (${currency}, optional)`}
          hint="The only condition this discount model supports — no company-type or line-item conditions."
        >
          <Input id="disc-min-subtotal" inputMode="decimal" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField id="disc-starts" label="Starts">
            <Input
              id="disc-starts"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              disabled={isEdit}
            />
          </FormField>
          <FormField id="disc-ends" label="Ends (optional)">
            <Input id="disc-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </FormField>
        </div>

        <FormField id="disc-usage-limit" label="Usage limit (optional)">
          <Input id="disc-usage-limit" type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
        </FormField>
      </form>
    </Dialog>
  );
}
