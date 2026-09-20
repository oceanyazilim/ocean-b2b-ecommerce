"use client";

import {
  PRICE_LIST_STATUSES,
  type InventoryVariantCandidate,
  type Paginated,
  type PriceListDetail,
  type PriceListPriceEntry,
  type PriceListStatus,
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
  DataGrid,
  Dialog,
  FormField,
  Input,
  Select,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AssignmentsCard } from "@/components/assignments-card";
import { VariantPicker } from "@/components/pickers";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

import { formatBps, PRICE_LIST_STATUS_BADGE } from "../../price-lists-list";

// Spec example: "Retail price €100, Wholesale adjustment -20%, Wholesale price €80". This is
// exactly what `adjustmentBps` does (a percentage off/on the base price) — shown live off the
// real field being edited, not a fabricated one. Explicit per-variant prices (below) are the
// separate "fixed pricing" mechanism, which wins over this percentage for the variants it covers.
function AdjustmentPreview({ currency, percent }: { currency: string; percent: number }) {
  const sample = 10000; // 100.00 in minor units — an illustrative reference price, not real data
  const adjusted = Math.max(0, Math.round(sample * (1 + percent / 100)));
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span>Example</span>
      <span className="tabular-nums text-foreground">
        {formatMoney({ amount: sample, currency })} → {percent >= 0 ? "+" : ""}
        {percent}% → {formatMoney({ amount: adjusted, currency })}
      </span>
    </div>
  );
}

export function PriceListDetailView({
  storeId,
  storeSlug,
  priceList,
  canWrite,
}: {
  storeId: string;
  storeSlug: string;
  priceList: PriceListDetail;
  canWrite: boolean;
}) {
  const router = useRouter();
  const submit = useSubmit();
  const [name, setName] = useState(priceList.name);
  const [description, setDescription] = useState(priceList.description ?? "");
  const [status, setStatus] = useState<PriceListStatus>(priceList.status);
  const [percent, setPercent] = useState((priceList.adjustmentBps / 100).toString());
  const [priority, setPriority] = useState(String(priceList.priority));
  const [version, setVersion] = useState(priceList.version);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = `/stores/${storeId}/price-lists/${priceList.id}`;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setConflict(false);
    setSaved(false);
    const res = await submit.run(async () => {
      try {
        return await api<{ data: PriceListDetail }>(base, {
          method: "PATCH",
          body: {
            name,
            description: description.trim() || null,
            status,
            adjustmentBps: Math.round((Number(percent.replace(",", ".")) || 0) * 100),
            priority: Number(priority) || 0,
            version,
          },
        });
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "conflict" && !err.fields.length) {
          setConflict(true);
        }
        throw err;
      }
    });
    if (res) {
      setVersion(res.data.version);
      setSaved(true);
      router.refresh();
    }
  }

  async function onDelete() {
    const ok = await submit.run(() => api(base, { method: "DELETE" }));
    if (ok !== undefined) router.push(`/${storeSlug}/pricing`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${storeSlug}/pricing`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Price lists
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">{priceList.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={PRICE_LIST_STATUS_BADGE[priceList.status]}>{priceList.status}</Badge>
            <span>{formatBps(priceList.adjustmentBps)}</span>
            <span>· priority {priceList.priority}</span>
            <span>· {priceList.currency}</span>
          </div>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
            <Button type="submit" form="price-list-form" loading={submit.pending}>
              Save
            </Button>
          </div>
        )}
      </div>
      {conflict && (
        <Alert variant="warning" title="Someone else saved this price list">
          Reload the page to see their changes, then apply yours again.
        </Alert>
      )}
      {submit.error && !conflict && <Alert variant="error">{submit.error}</Alert>}
      {saved && <Alert variant="success">Saved.</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
        <PriceListPrices
          storeId={storeId}
          priceListId={priceList.id}
          currency={priceList.currency}
          canWrite={canWrite}
        />
        <div className="flex flex-col gap-6">
          <form id="price-list-form" onSubmit={(e) => void onSave(e)}>
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
                <CardDescription>
                  Explicit prices below win; every other variant gets the base price adjusted by the
                  percentage.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <FormField id="pl-name" label="Name" error={submit.fieldErrors.name}>
                  <Input
                    id="pl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={120}
                    disabled={!canWrite}
                  />
                </FormField>
                <FormField id="pl-status" label="Status">
                  <Select
                    id="pl-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PriceListStatus)}
                    disabled={!canWrite}
                  >
                    {PRICE_LIST_STATUSES.map((s) => (
                      <option key={s} value={s} className="capitalize">
                        {s}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    id="pl-adj"
                    label="Adjustment (%)"
                    hint="-10 = 10% off"
                    error={submit.fieldErrors.adjustmentBps}
                  >
                    <Input
                      id="pl-adj"
                      inputMode="decimal"
                      value={percent}
                      onChange={(e) => setPercent(e.target.value)}
                      disabled={!canWrite}
                    />
                  </FormField>
                  <FormField
                    id="pl-prio"
                    label="Priority"
                    hint="Higher wins"
                    error={submit.fieldErrors.priority}
                  >
                    <Input
                      id="pl-prio"
                      type="number"
                      min={0}
                      max={1000}
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={!canWrite}
                    />
                  </FormField>
                </div>
                <FormField id="pl-desc" label="Description" error={submit.fieldErrors.description}>
                  <Textarea
                    id="pl-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={1000}
                    disabled={!canWrite}
                  />
                </FormField>
                <AdjustmentPreview
                  currency={priceList.currency}
                  percent={Number(percent.replace(",", ".")) || 0}
                />
              </CardContent>
            </Card>
          </form>
          <AssignmentsCard
            storeId={storeId}
            storeSlug={storeSlug}
            endpoint={`${base}/assignments`}
            assignments={priceList.assignments}
            canWrite={canWrite}
            description="Companies and locations that get these prices."
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={onDelete}
        title={`Delete ${priceList.name}?`}
        description="Assigned buyers fall back to their next price list or the base price."
        confirmLabel="Delete"
        destructive
        pending={submit.pending}
      />
    </div>
  );
}

function PriceListPrices({
  storeId,
  priceListId,
  currency,
  canWrite,
}: {
  storeId: string;
  priceListId: string;
  currency: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<PriceListPriceEntry[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<
    { kind: "new" } | { kind: "edit"; entry: PriceListPriceEntry } | null
  >(null);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = `/stores/${storeId}/price-lists/${priceListId}/prices`;

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (after) params.set("cursor", after);
        const res = await api<Paginated<PriceListPriceEntry>>(`${base}?${params}`);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [base, q],
  );
  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);
  const rows = useMemo(() => pages.flat(), [pages]);

  async function removeSelected() {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/remove`, { body: { variantIds: [...selected] } });
      setSelected(new Set());
      await load(null, false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: DataGridColumn<PriceListPriceEntry>[] = [
    {
      key: "variant",
      header: "Variant",
      cell: (p) => (
        <div>
          <div className="font-medium">
            {p.productTitle}
            {p.variantTitle !== "Default Title" && (
              <span className="text-muted-foreground"> · {p.variantTitle}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{p.sku ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "base",
      header: "Base",
      className: "text-right",
      cell: (p) => (
        <span className="tabular-nums text-muted-foreground">{formatMoney(p.basePrice)}</span>
      ),
    },
    {
      key: "price",
      header: "List price",
      className: "text-right",
      cell: (p) => <span className="tabular-nums font-medium">{formatMoney(p.price)}</span>,
    },
    {
      key: "compare",
      header: "Compare at",
      className: "text-right",
      cell: (p) => (
        <span className="tabular-nums text-muted-foreground">
          {p.compareAtPrice ? formatMoney(p.compareAtPrice) : "—"}
        </span>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (p: PriceListPriceEntry) => (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing({ kind: "edit", entry: p })}
              >
                Edit
              </Button>
            ),
          } satisfies DataGridColumn<PriceListPriceEntry>,
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Explicit prices</CardTitle>
          <CardDescription>Fixed prices for specific variants in {currency}.</CardDescription>
        </div>
        {canWrite && (
          <Button type="button" size="sm" onClick={() => setEditing({ kind: "new" })}>
            Set a price
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          placeholder="Search by product or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          aria-label="Search list prices"
        />
        {error && <Alert variant="error">{error}</Alert>}
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(p) => p.variantId}
          loading={loading}
          selectable={canWrite}
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={
            <>
              <Button size="sm" variant="outline" onClick={() => setBulkEditing(true)}>
                Bulk edit prices
              </Button>
              <Button
                size="sm"
                variant="destructive"
                loading={busy}
                onClick={() => void removeSelected()}
              >
                Remove prices
              </Button>
            </>
          }
          empty={{
            title: q ? "No prices match" : "No explicit prices",
            description: q
              ? "Try another search."
              : "Without explicit prices the percentage adjustment applies to every variant.",
          }}
          pageInfo={{
            hasNextPage: hasNext,
            onNext: () => void load(cursor, true),
            onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
          }}
        />
      </CardContent>
      <PriceDialog
        storeId={storeId}
        endpoint={base}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          void load(null, false);
          router.refresh();
        }}
      />
      <BulkEditDialog
        endpoint={base}
        entries={rows.filter((r) => selected.has(r.variantId))}
        open={bulkEditing}
        onClose={() => setBulkEditing(false)}
        onSaved={() => {
          setSelected(new Set());
          void load(null, false);
          router.refresh();
        }}
      />
    </Card>
  );
}

// Applies one percentage or fixed adjustment to every selected row's *current list price* in a
// single PUT call — the same `prices: [...]` array the single-price dialog already sends (the
// API already accepts up to 500 at once; this UI just lets a merchant use that for more than one
// variant, which is the spec's "Allow bulk price editing").
function BulkEditDialog({
  endpoint,
  entries,
  open,
  onClose,
  onSaved,
}: {
  endpoint: string;
  entries: PriceListPriceEntry[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const [mode, setMode] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) {
      reset();
      setMode("percent");
      setValue("");
    }
  }, [open, reset]);

  function preview(entry: PriceListPriceEntry): number {
    const current = entry.price.amount;
    const n = Number(value.replace(",", ".")) || 0;
    if (mode === "percent") return Math.max(0, Math.round(current * (1 + n / 100)));
    return Math.max(0, current + Math.round(n * 100));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (entries.length === 0) return;
    const res = await submit.run(() =>
      api(endpoint, {
        method: "PUT",
        body: {
          prices: entries.map((entry) => ({
            variantId: entry.variantId,
            price: preview(entry),
            compareAtPrice: entry.compareAtPrice?.amount ?? null,
          })),
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
      open={open}
      onClose={onClose}
      title={`Bulk edit ${entries.length} price${entries.length === 1 ? "" : "s"}`}
      description="Adjusts each selected variant's current list price by the same amount."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="bulk-price-form"
            loading={submit.pending}
            disabled={entries.length === 0 || !value.trim()}
          >
            Apply to {entries.length}
          </Button>
        </>
      }
    >
      <form id="bulk-price-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="bulk-mode" label="Adjust by">
            <Select id="bulk-mode" value={mode} onChange={(e) => setMode(e.target.value as "percent" | "fixed")}>
              <option value="percent">Percentage</option>
              <option value="fixed">Fixed amount</option>
            </Select>
          </FormField>
          <FormField
            id="bulk-value"
            label={mode === "percent" ? "Percent (e.g. -10)" : "Amount (e.g. -5.00)"}
          >
            <Input id="bulk-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          </FormField>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Select rows in the table to bulk edit.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-md border text-sm">
            {entries.map((entry) => (
              <div key={entry.variantId} className="flex items-center justify-between gap-2 border-b px-3 py-1.5 last:border-b-0">
                <span className="min-w-0 truncate">{entry.productTitle}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(entry.price)}
                  {value.trim() && <> → {formatMoney({ amount: preview(entry), currency: entry.price.currency })}</>}
                </span>
              </div>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  );
}

function PriceDialog({
  storeId,
  endpoint,
  editing,
  onClose,
  onSaved,
}: {
  storeId: string;
  endpoint: string;
  editing: { kind: "new" } | { kind: "edit"; entry: PriceListPriceEntry } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const submit = useSubmit();
  const { reset } = submit;
  const current = editing?.kind === "edit" ? editing.entry : null;
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");

  useEffect(() => {
    reset();
    setVariant(null);
    setPrice(current ? minorToInput(current.price.amount) : "");
    setCompareAt(current?.compareAtPrice ? minorToInput(current.compareAtPrice.amount) : "");
  }, [current, editing, reset]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const variantId = current?.variantId ?? variant?.variantId;
    if (!variantId) return;
    const res = await submit.run(() =>
      api(endpoint, {
        method: "PUT",
        body: {
          prices: [
            { variantId, price: inputToMinor(price) ?? 0, compareAtPrice: inputToMinor(compareAt) },
          ],
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
      title={current ? `Edit price · ${current.productTitle}` : "Set a list price"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="price-form"
            loading={submit.pending}
            disabled={!current && !variant}
          >
            Save
          </Button>
        </>
      }
    >
      <form id="price-form" onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {!current && (
          <VariantPicker
            storeId={storeId}
            value={variant}
            onChange={setVariant}
            error={submit.fieldErrors.prices}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="lp-price" label="List price">
            <Input
              id="lp-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              autoFocus={!!current}
            />
          </FormField>
          <FormField id="lp-compare" label="Compare at (optional)">
            <Input
              id="lp-compare"
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
            />
          </FormField>
        </div>
      </form>
    </Dialog>
  );
}
