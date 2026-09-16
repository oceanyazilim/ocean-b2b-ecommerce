"use client";

import { formatAddressLines, type Address } from "@ocean/types";
import { FormField, Input } from "@ocean/ui";

export interface AddressDraft {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  countryCode: string;
  zip: string;
  phone: string;
}

export const emptyAddress = (countryCode = "TR"): AddressDraft => ({
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  province: "",
  countryCode,
  zip: "",
  phone: "",
});

export function addressToDraft(address: Address | null | undefined): AddressDraft {
  if (!address) return emptyAddress();
  return {
    firstName: address.firstName ?? "",
    lastName: address.lastName ?? "",
    company: address.company ?? "",
    address1: address.address1,
    address2: address.address2 ?? "",
    city: address.city,
    province: address.province ?? "",
    countryCode: address.countryCode,
    zip: address.zip ?? "",
    phone: address.phone ?? "",
  };
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);

export function draftToAddress(draft: AddressDraft): Address {
  return {
    firstName: orNull(draft.firstName),
    lastName: orNull(draft.lastName),
    company: orNull(draft.company),
    address1: draft.address1.trim(),
    address2: orNull(draft.address2),
    city: draft.city.trim(),
    province: orNull(draft.province),
    countryCode: draft.countryCode.trim().toUpperCase(),
    zip: orNull(draft.zip),
    phone: orNull(draft.phone),
  };
}

export function isAddressBlank(draft: AddressDraft): boolean {
  return !draft.address1.trim() && !draft.city.trim();
}

export function formatAddressInline(address: Address | null | undefined): string {
  if (!address) return "—";
  return formatAddressLines(address).join(", ");
}

// Field errors from the API arrive as e.g. "shippingAddress.city"; `prefix` strips that.
export function AddressFields({
  value,
  onChange,
  idPrefix,
  errors = {},
  prefix = "",
  disabled = false,
  showName = true,
}: {
  value: AddressDraft;
  onChange: (next: AddressDraft) => void;
  idPrefix: string;
  errors?: Record<string, string>;
  prefix?: string;
  disabled?: boolean;
  showName?: boolean;
}) {
  const err = (field: keyof AddressDraft) => errors[prefix ? `${prefix}.${field}` : field];
  const set = (field: keyof AddressDraft) => (v: string) => onChange({ ...value, [field]: v });
  const field = (
    key: keyof AddressDraft,
    label: string,
    extra: { required?: boolean; maxLength?: number; className?: string; type?: string } = {},
  ) => (
    <FormField id={`${idPrefix}-${key}`} label={label} error={err(key)} className={extra.className}>
      <Input
        id={`${idPrefix}-${key}`}
        value={value[key]}
        onChange={(e) => set(key)(e.target.value)}
        required={extra.required}
        maxLength={extra.maxLength ?? 120}
        disabled={disabled}
        invalid={!!err(key)}
        type={extra.type}
      />
    </FormField>
  );
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {showName && field("firstName", "First name", { maxLength: 80 })}
      {showName && field("lastName", "Last name", { maxLength: 80 })}
      {field("company", "Company", { className: "sm:col-span-2" })}
      {field("address1", "Address", { required: true, maxLength: 200, className: "sm:col-span-2" })}
      {field("address2", "Apartment, suite, etc.", { maxLength: 200, className: "sm:col-span-2" })}
      {field("city", "City", { required: true })}
      {field("province", "Province / State")}
      {field("zip", "Postal code", { maxLength: 20 })}
      {field("countryCode", "Country code (ISO 2)", { required: true, maxLength: 2 })}
      {field("phone", "Phone", { maxLength: 40, className: "sm:col-span-2", type: "tel" })}
    </div>
  );
}
