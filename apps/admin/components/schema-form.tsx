"use client";

import type { BusinessProfileFieldDefinition } from "@ocean/types";
import { Checkbox, FormField, Input, Select, Textarea } from "@ocean/ui";

// Generic, country-agnostic renderer for a CountryProfile's businessProfileSchema (spec sections
// 17-18). It never branches on which country produced `fields` — every visible input, its type,
// its required-ness and its validation come entirely from the field definitions passed in. Adding
// a brand-new country only ever means new CountryProfile seed data; this component (and its
// server-side validation twin, apps/api business-profile-validation.ts) never changes.

export type SchemaFormValue = string | number | boolean | null;
export type SchemaFormValues = Record<string, SchemaFormValue>;

// A field is visible only when the currently-selected business entity type is one of
// visibilityRules.entityTypeIn — or always, when that rule is omitted/empty.
export function isSchemaFieldVisible(
  field: Pick<BusinessProfileFieldDefinition, "visibilityRules">,
  entityType: string,
): boolean {
  const allowed = field.visibilityRules?.entityTypeIn;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(entityType);
}

// Client-side mirror of the server's required/regex checks, for immediate feedback. The server
// (business-profile-validation.ts) re-checks the same rules and is the actual source of truth.
export function validateSchemaField(
  field: BusinessProfileFieldDefinition,
  rawValue: SchemaFormValue | undefined,
): string | null {
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  const empty = value === undefined || value === null || value === "";
  if (field.required && empty) return `${field.label} is required`;
  if (!empty && field.validationRegex) {
    try {
      if (!new RegExp(field.validationRegex).test(String(value))) {
        return `${field.label} is not in the correct format`;
      }
    } catch {
      // A malformed regex in the country's own schema shouldn't block submission client-side —
      // the server applies the same guard and simply skips an unparsable pattern.
    }
  }
  return null;
}

export function SchemaForm({
  fields,
  entityType,
  values,
  onChange,
  errors,
  readOnly = false,
  idPrefix = "biz",
}: {
  fields: BusinessProfileFieldDefinition[];
  entityType: string;
  values: SchemaFormValues;
  onChange: (next: SchemaFormValues) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  idPrefix?: string;
}) {
  const visible = fields.filter((f) => isSchemaFieldVisible(f, entityType));
  if (visible.length === 0) return null;

  function set(key: string, value: SchemaFormValue) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const value = values[field.key];
        const error = errors?.[field.key];
        const wide = field.inputType === "textarea" || field.inputType === "checkbox";
        return (
          <FormField
            key={field.key}
            id={id}
            label={field.label}
            hint={field.description}
            error={error}
            className={wide ? "sm:col-span-2" : undefined}
          >
            <SchemaFieldInput
              field={field}
              id={id}
              value={value}
              onChange={(v) => set(field.key, v)}
              readOnly={readOnly}
              invalid={!!error}
            />
          </FormField>
        );
      })}
    </div>
  );
}

function SchemaFieldInput({
  field,
  id,
  value,
  onChange,
  readOnly,
  invalid,
}: {
  field: BusinessProfileFieldDefinition;
  id: string;
  value: SchemaFormValue | undefined;
  onChange: (value: SchemaFormValue) => void;
  readOnly: boolean;
  invalid: boolean;
}) {
  const stringValue = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

  switch (field.inputType) {
    case "select":
      return (
        <Select
          id={id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          required={field.required}
        >
          <option value="">{field.placeholder ?? "Select..."}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "checkbox":
      return (
        <Checkbox
          id={id}
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={id}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          placeholder={field.placeholder}
          required={field.required}
          rows={3}
        />
      );
    case "number":
      return (
        <Input
          id={id}
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          disabled={readOnly}
          invalid={invalid}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "date":
      return (
        <Input
          id={id}
          type="date"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          required={field.required}
        />
      );
    case "email":
      return (
        <Input
          id={id}
          type="email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "phone":
      return (
        <Input
          id={id}
          type="tel"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
    case "text":
    default:
      return (
        <Input
          id={id}
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          invalid={invalid}
          placeholder={field.placeholder}
          required={field.required}
        />
      );
  }
}
