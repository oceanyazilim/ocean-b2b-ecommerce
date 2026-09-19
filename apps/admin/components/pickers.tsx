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

export function ResultList<T>({
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

// Reusable link-target field: a raw URL, or a search-as-you-type pick of a product, collection
// or page (resolved to that resource's storefront path). Used by the menu builder for both
// simple item links and mega-menu column/promo links.
export const LINK_TARGET_TYPES = ["url", "product", "collection", "page"] as const;
export type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];

export interface LinkTargetValue {
  url: string;
  linkType: LinkTargetType | null;
  resourceId: string | null;
}

export const EMPTY_LINK_TARGET: LinkTargetValue = { url: "", linkType: null, resourceId: null };

const LINK_TARGET_LABEL: Record<LinkTargetType, string> = {
  url: "URL",
  product: "Product",
  collection: "Collection",
  page: "Page",
};

const RESOURCE_ENDPOINT: Record<Exclude<LinkTargetType, "url">, string> = {
  product: "products",
  collection: "collections",
  page: "pages",
};

const RESOURCE_PATH_PREFIX: Record<Exclude<LinkTargetType, "url">, string> = {
  product: "/products",
  collection: "/collections",
  page: "/pages",
};

interface ResourceCandidate {
  id: string;
  title: string;
  handle: string;
}

export function LinkTargetField({
  storeId,
  value,
  onChange,
  id,
  label = "Link",
}: {
  storeId: string;
  value: LinkTargetValue;
  onChange: (value: LinkTargetValue) => void;
  id: string;
  label?: string;
}) {
  const mode: LinkTargetType = value.linkType ?? "url";
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ResourceCandidate[]>([]);

  useEffect(() => {
    if (mode === "url") {
      setItems([]);
      return;
    }
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ limit: "20" });
      if (q.trim()) params.set("q", q.trim());
      void api<{ data: ResourceCandidate[] }>(`/stores/${storeId}/${RESOURCE_ENDPOINT[mode]}?${params}`)
        .then((res) => setItems(res.data))
        .catch(() => setItems([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [mode, q, storeId]);

  function setMode(next: LinkTargetType) {
    setQ("");
    if (next === "url") {
      onChange({ url: mode === "url" ? value.url : "", linkType: null, resourceId: null });
    } else {
      onChange({ url: "", linkType: next, resourceId: null });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <FormField id={id} label={label}>
        <div className="flex gap-2">
          <Select
            aria-label={`${label} type`}
            value={mode}
            onChange={(e) => setMode(e.target.value as LinkTargetType)}
            className="w-32 shrink-0"
          >
            {LINK_TARGET_TYPES.map((t) => (
              <option key={t} value={t}>
                {LINK_TARGET_LABEL[t]}
              </option>
            ))}
          </Select>
          {mode === "url" ? (
            <Input
              id={id}
              placeholder="https:// or /path"
              value={value.url}
              onChange={(e) => onChange({ url: e.target.value, linkType: null, resourceId: null })}
            />
          ) : (
            <Input
              placeholder={`Search ${LINK_TARGET_LABEL[mode].toLowerCase()}s`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}
        </div>
      </FormField>
      {mode !== "url" && value.resourceId && value.url && (
        <p className="text-sm">
          Selected: <span className="font-medium">{value.url}</span>
        </p>
      )}
      {mode !== "url" && (
        <ResultList
          label={`Matching ${LINK_TARGET_LABEL[mode].toLowerCase()}s`}
          items={items}
          selectedId={value.resourceId}
          getId={(r) => r.id}
          onPick={(r) =>
            onChange({
              url: `${RESOURCE_PATH_PREFIX[mode]}/${r.handle}`,
              linkType: mode,
              resourceId: r.id,
            })
          }
          emptyText={`No matching ${LINK_TARGET_LABEL[mode].toLowerCase()}s.`}
          render={(r) => (
            <>
              <span>{r.title}</span>
              <span className="text-xs text-muted-foreground">/{r.handle}</span>
            </>
          )}
        />
      )}
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
