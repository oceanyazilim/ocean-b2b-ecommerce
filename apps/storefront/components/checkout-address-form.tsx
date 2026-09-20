"use client";

import type { AddressFieldDefinition } from "@ocean/types";

import type { AddressFormValues } from "@/lib/address-schema";

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

// Country-specific checkout (spec section 44): renders exactly the fields the buyer's selected
// CountryProfile.addressSchema defines — nothing more, nothing hardcoded. A country whose schema
// has no "State"/"Province" field (e.g. GB, DE) never shows one; a field's `required` flag comes
// straight from that country's schema, so a market with no postal-code system never forces one.
// This is the storefront's lightweight port of apps/admin/components/address-schema-form.tsx —
// same principle, plain HTML instead of @ocean/ui since the storefront doesn't depend on it.
export function CheckoutAddressForm({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: AddressFieldDefinition[];
  values: AddressFormValues;
  onChange: (next: AddressFormValues) => void;
  errors?: Record<string, string>;
}) {
  if (fields.length === 0) return null;

  function set(key: string, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const value = values[field.key] ?? "";
        const error = errors?.[field.key];
        return (
          <div key={field.key} className="flex flex-col gap-1">
            {field.type === "select" ? (
              <select
                aria-label={field.label}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                required={field.required}
                className={inputClass}
              >
                <option value="">{field.placeholder ?? field.label}</option>
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={field.label}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                required={field.required}
                maxLength={field.maxLength}
                placeholder={field.placeholder ?? field.label}
                className={inputClass}
              />
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        );
      })}
    </div>
  );
}
