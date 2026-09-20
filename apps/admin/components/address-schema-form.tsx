"use client";

import type { AddressFieldDefinition } from "@ocean/types";
import { FormField, Input, Select } from "@ocean/ui";

// Generic, country-agnostic renderer for a CountryProfile's addressSchema (spec section 19: "Do
// not use the exact same address form globally"). Same principle as SchemaForm: the field list,
// its types and its required-ness come entirely from the definitions passed in, never from a
// per-country branch here.

export type AddressFormValues = Record<string, string>;

export function validateAddressField(
  field: AddressFieldDefinition,
  rawValue: string | undefined,
): string | null {
  const value = (rawValue ?? "").trim();
  if (field.required && !value) return `${field.label} is required`;
  if (value && field.maxLength && value.length > field.maxLength) {
    return `${field.label} must be ${field.maxLength} characters or fewer`;
  }
  return null;
}

export function AddressSchemaForm({
  fields,
  values,
  onChange,
  errors,
  readOnly = false,
  idPrefix = "addr",
}: {
  fields: AddressFieldDefinition[];
  values: AddressFormValues;
  onChange: (next: AddressFormValues) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  idPrefix?: string;
}) {
  if (fields.length === 0) return null;

  function set(key: string, value: string) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const value = values[field.key] ?? "";
        const error = errors?.[field.key];
        return (
          <FormField key={field.key} id={id} label={field.label} error={error}>
            {field.type === "select" ? (
              <Select
                id={id}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                disabled={readOnly}
                invalid={!!error}
                required={field.required}
              >
                <option value="">{field.placeholder ?? "Select..."}</option>
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                value={value}
                onChange={(e) => set(field.key, e.target.value)}
                disabled={readOnly}
                invalid={!!error}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                required={field.required}
              />
            )}
          </FormField>
        );
      })}
    </div>
  );
}
