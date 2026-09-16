"use client";

import type {
  CompanyCandidate,
  ContractPriceSummary,
  InventoryVariantCandidate,
  Paginated,
} from "@ocean/types";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataGrid,
  Dialog,
  FormField,
  Input,
  Textarea,
  type DataGridColumn,
} from "@ocean/ui";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { CompanyPicker, LocationSelect, VariantPicker } from "@/components/pickers";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, inputToMinor, minorToInput } from "@/lib/money";
import { useSubmit } from "@/lib/use-submit";

type Editing =
  | { kind: "new"; companyId?: string | undefined }
  | { kind: "edit"; entry: ContractPriceSummary }
  | null;

export function ContractPrices({
  storeId,
  storeSlug,
  canWrite,
  companyId,
}: {
  storeId: string;
  storeSlug: string;
  canWrite: boolean;
  // When set, the list is scoped to one company (company page tab).
  companyId?: string;
}) {
  const [q, setQ] = useState("");
  const [pages, setPages] = useState<ContractPriceSummary[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ContractPriceSummary | null>(null);
  const action = useSubmit();
  const base = `/stores/${storeId}/pricing/contract-prices`;

  const load = useCallback(
    async (after: string | null, append: boolean) => {
      setLoading(!append);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "25" });
        if (q.trim()) params.set("q", q.trim());
        if (companyId) params.set("companyId", companyId);
        if (after) params.set("cursor", after);
        const res = await api<Paginated<ContractPriceSummary>>(`${base}?${params}`);
        setPages((prev) => (append ? [...prev, res.data] : [res.data]));
        setCursor(res.pageInfo.endCursor);
        setHasNext(res.pageInfo.hasNextPage);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [base, q, companyId],
  );
  useEffect(() => {
    const handle = setTimeout(() => void load(null, false), q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [load, q]);
  const rows = useMemo(() => pages.flat(), [pages]);

  const columns: DataGridColumn<ContractPriceSummary>[] = [
    ...(companyId
      ? []
      : [
          {
            key: "company",
            header: "Company",
            cell: (c: ContractPriceSummary) => (
              <div>
                <Link
                  href={`/${storeSlug}/companies/${c.company.id}`}
                  className="font-medium hover:underline"
                >
                  {c.company.displayName}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {c.location?.name ?? "All locations"}
                </div>
              </div>
            ),
          } satisfies DataGridColumn<ContractPriceSummary>,
        ]),
    ...(companyId
      ? [
          {
            key: "location",
            header: "Location",
            cell: (c: ContractPriceSummary) => (
              <span className="text-muted-foreground">{c.location?.name ?? "All locations"}</span>
            ),
          } satisfies DataGridColumn<ContractPriceSummary>,
        ]
      : []),
    {
      key: "variant",
      header: "Variant",
      cell: (c) => (
        <div>
          <div className="font-medium">
            {c.variant.productTitle}
            {c.variant.title !== "Default Title" && (
              <span className="text-muted-foreground"> · {c.variant.title}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{c.variant.sku ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "base",
      header: "Base",
      className: "text-right",
      cell: (c) => (
        <span className="tabular-nums text-muted-foreground">{formatMoney(c.basePrice)}</span>
      ),
    },
    {
      key: "price",
      header: "Contract price",
      className: "text-right",
      cell: (c) => <span className="tabular-nums font-medium">{formatMoney(c.price)}</span>,
    },
    {
      key: "validity",
      header: "Validity",
      cell: (c) => (
        <div className="flex flex-col gap-0.5 text-xs">
          <Badge variant={c.isCurrent ? "success" : "secondary"}>
            {c.isCurrent ? "Current" : "Not in window"}
          </Badge>
          {(c.validFrom || c.validTo) && (
            <span className="text-muted-foreground">
              {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : "…"} –{" "}
              {c.validTo ? new Date(c.validTo).toLocaleDateString() : "…"}
            </span>
          )}
        </div>
      ),
    },
    ...(canWrite
      ? [
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (c: ContractPriceSummary) => (
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind: "edit", entry: c })}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(c)}>
                  Delete
                </Button>
              </div>
            ),
          } satisfies DataGridColumn<ContractPriceSummary>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Negotiated unit prices per company or location. They beat every list and tier.
        </p>
        {canWrite && (
          <Button onClick={() => setEditing({ kind: "new", companyId })}>New contract price</Button>
        )}
      </div>
      <Input
        placeholder="Search by company, product or SKU"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md"
        aria-label="Search contract prices"
      />
      {(error ?? action.error) && <Alert variant="error">{error ?? action.error}</Alert>}
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        loading={loading}
        empty={{
          title: q ? "No contract prices match" : "No contract prices yet",
          description: q
            ? "Try another search."
            : "Add a negotiated price for a company and a variant.",
          action:
            canWrite && !q ? (
              <Button onClick={() => setEditing({ kind: "new", companyId })}>
                Add first contract price
              </Button>
            ) : undefined,
        }}
        pageInfo={{
          hasNextPage: hasNext,
          onNext: () => void load(cursor, true),
          onFirst: pages.length > 1 ? () => void load(null, false) : undefined,
        }}
      />
      <ContractDialog
        storeId={storeId}
        base={base}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load(null, false)}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this contract price?"
        description="The company goes back to its price list or the base price."
        confirmLabel="Delete"
        destructive
        pending={action.pending}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await action.run(() => api(`${base}/${deleting.id}`, { method: "DELETE" }));
          if (ok !== undefined) {
            setDeleting(null);
            await load(null, false);
          }
        }}
      />
    </div>
  );
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDateInput = (v: string, endOfDay: boolean) =>
  v ? new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`).toISOString() : null;

function ContractDialog({
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
  const current = editing?.kind === "edit" ? editing.entry : null;
  const presetCompanyId = editing?.kind === "new" ? (editing.companyId ?? null) : null;
  const [company, setCompany] = useState<CompanyCandidate | null>(null);
  const [locationId, setLocationId] = useState("");
  const [variant, setVariant] = useState<InventoryVariantCandidate | null>(null);
  const [price, setPrice] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    reset();
    setCompany(null);
    setLocationId(current?.location?.id ?? "");
    setVariant(null);
    setPrice(current ? minorToInput(current.price.amount) : "");
    setValidFrom(toDateInput(current?.validFrom ?? null));
    setValidTo(toDateInput(current?.validTo ?? null));
    setNote(current?.note ?? "");
  }, [current, editing, reset]);

  const companyId = current?.company.id ?? presetCompanyId ?? company?.id ?? null;
  const variantId = current?.variant.id ?? variant?.variantId ?? null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !variantId) return;
    const res = await submit.run(() =>
      api(base, {
        method: "PUT",
        body: {
          companyId,
          companyLocationId: locationId || null,
          variantId,
          price: inputToMinor(price) ?? 0,
          validFrom: fromDateInput(validFrom, false),
          validTo: fromDateInput(validTo, true),
          note: note.trim() || null,
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
      title={
        current ? `Edit contract price · ${current.company.displayName}` : "New contract price"
      }
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="contract-form"
            loading={submit.pending}
            disabled={!companyId || !variantId}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id="contract-form"
        onSubmit={(e) => void onSubmit(e)}
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1"
      >
        {submit.error && <Alert variant="error">{submit.error}</Alert>}
        {!current && !presetCompanyId && (
          <CompanyPicker
            storeId={storeId}
            value={company}
            onChange={(c) => {
              setCompany(c);
              setLocationId("");
            }}
            error={submit.fieldErrors.companyId}
          />
        )}
        {current && (
          <p className="text-sm">
            {current.variant.productTitle}
            {current.variant.title !== "Default Title" && ` · ${current.variant.title}`}
            <span className="text-muted-foreground"> · base {formatMoney(current.basePrice)}</span>
          </p>
        )}
        {!current && (
          <VariantPicker
            storeId={storeId}
            value={variant}
            onChange={setVariant}
            error={submit.fieldErrors.variantId}
          />
        )}
        <LocationSelect
          storeId={storeId}
          companyId={companyId}
          value={locationId}
          onChange={setLocationId}
        />
        <div className="grid grid-cols-3 gap-3">
          <FormField id="cp-price" label="Unit price" error={submit.fieldErrors.price}>
            <Input
              id="cp-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </FormField>
          <FormField id="cp-from" label="Valid from" error={submit.fieldErrors.validFrom}>
            <Input
              id="cp-from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </FormField>
          <FormField id="cp-to" label="Valid to" error={submit.fieldErrors.validTo}>
            <Input
              id="cp-to"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </FormField>
        </div>
        <FormField id="cp-note" label="Note" error={submit.fieldErrors.note}>
          <Textarea
            id="cp-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
