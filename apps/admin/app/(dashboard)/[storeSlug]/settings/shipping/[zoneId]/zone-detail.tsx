"use client";

import {
  SHIPPING_RATE_TYPES,
  type ShippingRateSummary,
  type ShippingRateType,
  type ShippingZoneDetail,
} from "@ocean/types";
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
  Select,
  type DataGridColumn,
} from "@ocean/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { api } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

const TYPE_LABEL: Record<ShippingRateType, string> = {
  flat: "Flat rate",
  free: "Free",
  weight_based: "Weight-based",
  price_based: "Order-total based",
  pickup: "Local pickup",
  freight: "Freight",
};

type Editing = { kind: "new" } | { kind: "edit"; rate: ShippingRateSummary } | null;

export function ZoneDetailView({
  storeId,
  zone,
  canWrite,
}: {
  storeId: string;
  zone: ShippingZoneDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const action = useSubmit();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ShippingRateSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const base = `/stores/${storeId}/shipping/zones/${zone.id}`;

  async function mutate(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    const ok = await action.run(fn);
    setBusyId(null);
    if (ok !== undefined) router.refresh();
  }

  const columns: DataGridColumn<ShippingRateSummary>[] = [
    { key: "name", header: "Rate", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "type", header: "Type", cell: (r) => TYPE_LABEL[r.type] },
    {
      key: "price",
      header: "Price",
      className: "text-right",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.price)}</span>,
    },
    {
      key: "conditions",
      header: "Conditions",
      cell: (r) => {
        const parts: string[] = [];
        if (r.minSubtotal) parts.push(`≥ ${formatMoney(r.minSubtotal)}`);
        if (r.maxSubtotal) parts.push(`≤ ${formatMoney(r.maxSubtotal)}`);
        if (r.minWeightGrams) parts.push(`≥ ${r.minWeightGrams}g`);
        if (r.maxWeightGrams) parts.push(`≤ ${r.maxWeightGrams}g`);
        return <span className="text-muted-foreground">{parts.join(", ") || "None"}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <Badge variant={r.isActive ? "success" : "secondary"}>
          {r.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r: ShippingRateSummary) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: "edit", rate: r })}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<ShippingRateSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rates in <span className="font-medium text-foreground">{zone.name}</span>. The buyer sees
          every rate whose conditions match their cart; checkout picks the cheapest unless they
          choose another.
        </p>
        {canWrite && <Button onClick={() => setEditing({ kind: "new" })}>Add rate</Button>}
      </div>
      {action.error && <Alert variant="error">{action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={zone.rates}
        rowKey={(r) => r.id}
        empty={{
          title: "No rates yet",
          description: "Add one so this zone can quote shipping.",
          action: canWrite ? <Button onClick={() => setEditing({ kind: "new" })}>Add your first rate</Button> : undefined,
        }}
      />
      <RateDialog
        base={base}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this rate"}?`}
        destructive
        pending={busyId === deleting?.id}
        onConfirm={async () => {
          if (!deleting) return;
          await mutate(deleting.id, () => api(`${base}/rates/${deleting.id}`, { method: "DELETE" }));
          setDeleting(null);
        }}
      />
    </div>
  );
}

function RateDialog({
  base,
  editing,
  onClose,
  onSaved,
}: {
  base: string;
  editing: Editing;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.rate : null;
  const [name, setName] = useState("");
  const [type, setType] = useState<ShippingRateType>("flat");
  const [price, setPrice] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxSubtotal, setMaxSubtotal] = useState("");
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    reset();
    setName(current?.name ?? "");
    setType(current?.type ?? "flat");
    setPrice(minorToInput(current?.price.amount ?? 0));
    setMinSubtotal(minorToInput(current?.minSubtotal?.amount));
    setMaxSubtotal(minorToInput(current?.maxSubtotal?.amount));
    setMinWeight(current?.minWeightGrams?.toString() ?? "");
    setMaxWeight(current?.maxWeightGrams?.toString() ?? "");
    setIsActive(current?.isActive ?? true);
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      name,
      type,
      price: type === "free" ? 0 : (inputToMinor(price) ?? 0),
      minSubtotal: inputToMinor(minSubtotal),
      maxSubtotal: inputToMinor(maxSubtotal),
      minWeightGrams: minWeight.trim() ? Number(minWeight) : null,
      maxWeightGrams: maxWeight.trim() ? Number(maxWeight) : null,
      isActive,
    };
    const res = await submit.run(() =>
      current
        ? api(`${base}/rates/${current.id}`, { method: "PATCH", body })
        : api(`${base}/rates`, { body }),
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
      title={current ? "Edit rate" : "Add rate"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button type="submit" form="rate-form" loading={submit.pending}>
            {current ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <form id="rate-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <FormField id="rate-name" label="Name" error={submit.fieldErrors.name}>
          <Input id="rate-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoFocus />
        </FormField>
        <FormField id="rate-type" label="Type">
          <Select id="rate-type" value={type} onChange={(e) => setType(e.target.value as ShippingRateType)}>
            {SHIPPING_RATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </FormField>
        {type !== "free" && (
          <FormField id="rate-price" label="Price" error={submit.fieldErrors.price}>
            <Input id="rate-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="rate-min-subtotal" label="Min. order total (optional)">
            <Input id="rate-min-subtotal" inputMode="decimal" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder="0.00" />
          </FormField>
          <FormField id="rate-max-subtotal" label="Max. order total (optional)">
            <Input id="rate-max-subtotal" inputMode="decimal" value={maxSubtotal} onChange={(e) => setMaxSubtotal(e.target.value)} placeholder="0.00" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="rate-min-weight" label="Min. weight, g (optional)">
            <Input id="rate-min-weight" type="number" min={0} value={minWeight} onChange={(e) => setMinWeight(e.target.value)} />
          </FormField>
          <FormField id="rate-max-weight" label="Max. weight, g (optional)">
            <Input id="rate-max-weight" type="number" min={0} value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </Dialog>
  );
}
