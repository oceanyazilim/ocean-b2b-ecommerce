"use client";

import type {
  CompanyCandidate,
  CompanyLocationSummary,
  CustomerCandidate,
  InventoryVariantCandidate,
} from "@ocean/types";
import { FormField, Input, Select, cn } from "@ocean/ui";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

// Search-as-you-type pickers shared by the pricing and catalog screens. Each renders its own
// input plus a listbox of results; the caller keeps the selection.

function ResultList<T>({
  items,
  selectedId,
  getId,
  render,
  onPick,
  emptyText,
  label,
}: {
  items: T[];
  selectedId: string | null;
  getId: (item: T) => string;
  render: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  emptyText: string;
  label: string;
}) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="max-h-48 overflow-y-auto rounded-md border text-sm"
    >
      {items.length === 0 && <p className="px-3 py-2 text-muted-foreground">{emptyText}</p>}
      {items.map((item) => {
        const id = getId(item);
        return (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={selectedId === id}
            onClick={() => onPick(item)}
            className={cn(
              "flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent",
              selectedId === id && "bg-accent font-medium",
            )}
          >
            {render(item)}
          </button>
        );
      })}
    </div>
  );
}

export function variantLabel(v: InventoryVariantCandidate): string {
  const title = v.variantTitle === "Default Title" ? "" : ` · ${v.variantTitle}`;
  return `${v.productTitle}${title}`;
}

export function VariantPicker({
  storeId,
  value,
  onChange,
  id = "variant-picker",
  label = "Variant",
  error,
}: {
  storeId: string;
  value: InventoryVariantCandidate | null;
  onChange: (variant: InventoryVariantCandidate | null) => void;
  id?: string;
  label?: string;
  error?: string | undefined;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<InventoryVariantCandidate[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      void api<{ data: InventoryVariantCandidate[] }>(
        `/stores/${storeId}/pricing/variants?q=${encodeURIComponent(q)}&limit=20`,
      )
        .then((res) => setItems(res.data))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, storeId]);
  return (
    <div className="flex flex-col gap-2">
      <FormField id={id} label={label} error={error}>
        <Input
          id={id}
          placeholder="Search by product, variant or SKU"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </FormField>
      {value && (
        <p className="text-sm">
          Selected: <span className="font-medium">{variantLabel(value)}</span>
          {value.sku && <span className="text-muted-foreground"> ({value.sku})</span>}
        </p>
      )}
      <ResultList
        label="Matching variants"
        items={items}
        selectedId={value?.variantId ?? null}
        getId={(v) => v.variantId}
        onPick={onChange}
        emptyText="No matching variants."
        render={(v) => (
          <>
            <span>{variantLabel(v)}</span>
            <span className="text-xs text-muted-foreground">{v.sku ?? "—"}</span>
          </>
        )}
      />
    </div>
  );
}

export function CompanyPicker({
  storeId,
  value,
  onChange,
  id = "company-picker",
  error,
}: {
  storeId: string;
  value: CompanyCandidate | null;
  onChange: (company: CompanyCandidate | null) => void;
  id?: string;
  error?: string | undefined;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CompanyCandidate[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      void api<{ data: CompanyCandidate[] }>(
        `/stores/${storeId}/companies/search?q=${encodeURIComponent(q)}&limit=20`,
      )
        .then((res) => setItems(res.data))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, storeId]);
  return (
    <div className="flex flex-col gap-2">
      <FormField id={id} label="Company" error={error}>
        <Input
          id={id}
          placeholder="Search companies"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </FormField>
      {value && (
        <p className="text-sm">
          Selected: <span className="font-medium">{value.displayName}</span>
        </p>
      )}
      <ResultList
        label="Matching companies"
        items={items}
        selectedId={value?.id ?? null}
        getId={(c) => c.id}
        onPick={onChange}
        emptyText="No matching companies."
        render={(c) => (
          <>
            <span>{c.displayName}</span>
            <span className="text-xs text-muted-foreground">{c.status}</span>
          </>
        )}
      />
    </div>
  );
}

export function CustomerPicker({
  storeId,
  value,
  onChange,
  id = "customer-picker",
  error,
}: {
  storeId: string;
  value: CustomerCandidate | null;
  onChange: (customer: CustomerCandidate | null) => void;
  id?: string;
  error?: string | undefined;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CustomerCandidate[]>([]);
  useEffect(() => {
    const handle = setTimeout(() => {
      void api<{ data: CustomerCandidate[] }>(
        `/stores/${storeId}/customers/search?q=${encodeURIComponent(q)}&limit=20`,
      )
        .then((res) => setItems(res.data))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, storeId]);
  return (
    <div className="flex flex-col gap-2">
      <FormField id={id} label="Customer" error={error}>
        <Input
          id={id}
          placeholder="Search customers"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </FormField>
      {value && (
        <p className="text-sm">
          Selected: <span className="font-medium">{value.displayName}</span>
        </p>
      )}
      <ResultList
        label="Matching customers"
        items={items}
        selectedId={value?.id ?? null}
        getId={(c) => c.id}
        onPick={onChange}
        emptyText="No matching customers."
        render={(c) => (
          <>
            <span>{c.displayName}</span>
            <span className="text-xs text-muted-foreground">{c.email}</span>
          </>
        )}
      />
    </div>
  );
}

// Optional location under a chosen company; blank = company-wide.
export function LocationSelect({
  storeId,
  companyId,
  value,
  onChange,
  id = "location-select",
  label = "Location",
  hint = "Leave blank to apply company-wide.",
}: {
  storeId: string;
  companyId: string | null;
  value: string;
  onChange: (locationId: string) => void;
  id?: string;
  label?: string;
  hint?: string;
}) {
  const [locations, setLocations] = useState<CompanyLocationSummary[]>([]);
  useEffect(() => {
    if (!companyId) {
      setLocations([]);
      return;
    }
    void api<{ data: CompanyLocationSummary[] }>(
      `/stores/${storeId}/companies/${companyId}/locations`,
    )
      .then((res) => setLocations(res.data))
      .catch(() => setLocations([]));
  }, [companyId, storeId]);
  return (
    <FormField id={id} label={label} hint={hint}>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!companyId}
      >
        <option value="">Whole company</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
