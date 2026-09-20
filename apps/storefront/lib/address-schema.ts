import type { Address, AddressFieldDefinition } from "@ocean/types";

// Country-specific checkout (spec section 44): "Checkout fields must adapt based on customer
// country. Do not show 'State' in countries where it is irrelevant. Do not require 'Postal code'
// where the market does not use one. Use the same CountryProfile system as merchant onboarding."
//
// This is the storefront-side counterpart of apps/admin/components/address-schema-form.tsx —
// same data-driven principle (the field list, labels, types and required-ness come entirely from
// the fetched CountryProfile.addressSchema, never a second hardcoded field list here), ported
// rather than literally shared because the storefront app doesn't depend on @ocean/ui.
//
// One wrinkle admin's business-address flow doesn't have to deal with: checkout's Order still
// needs the platform's fixed `Address` shape (address1/city/province/zip/countryCode/...) for
// shipping-rate matching, tax calculation and fulfillment — all written before this localization
// work and out of scope to redesign here. Each CountryProfile's addressSchema uses real,
// country-specific keys instead (TR: "neighborhood"/"district"/"province"/"postalCode", DE:
// "street"/"houseNumber"/"postalCode"/"city", GB: "townCity"/"county"/"postcode", ...), so
// `buildAddressFromAnswers` below composes the fixed Address from those answers using semantic
// key aliases (city-like, province-like, postal-like, street-like) rather than a per-country
// branch — the same "never one country's name in this code" principle L1/L2 already follow.

export type AddressFormValues = Record<string, string>;

export function validateAddressField(
  field: AddressFieldDefinition,
  rawValue: string | undefined,
  messages: { required: (label: string) => string; invalid: (label: string) => string },
): string | null {
  const value = (rawValue ?? "").trim();
  if (field.required && !value) return messages.required(field.label);
  if (value && field.maxLength && value.length > field.maxLength) return messages.invalid(field.label);
  if (value && field.type === "select" && field.options && !field.options.some((o) => o.value === value)) {
    return messages.invalid(field.label);
  }
  return null;
}

const CITY_KEYS = ["city", "town", "towncity", "locality"];
const PROVINCE_KEYS = ["province", "state", "county", "region", "prefecture"];
const POSTAL_KEYS = ["zip", "zipcode", "postalcode", "postcode", "postal_code"];
const STREET_KEYS = ["address1", "street", "housenumber", "house_number", "streetaddress"];
const ADDRESS2_KEY = "address2";

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Composes the fixed `Address` the rest of the system expects (shipping rates, tax, fulfillment)
// from a country's dynamic addressSchema answers. Every CountryProfile field is classified by
// what it semantically holds — never by which country defined it — so this keeps working for the
// 5th, 10th, 50th country without a code change here.
export function buildAddressFromAnswers(
  fields: AddressFieldDefinition[],
  answers: AddressFormValues,
  countryCode: string,
  contact: { firstName?: string; lastName?: string; company?: string; phone?: string } = {},
): Address {
  const streetParts: string[] = [];
  const extraParts: string[] = [];
  let city = "";
  let province = "";
  let provinceCode = "";
  let zip = "";
  let address2 = "";

  for (const field of fields) {
    const value = (answers[field.key] ?? "").trim();
    if (!value) continue;
    const norm = normalizedKey(field.key);

    if (CITY_KEYS.includes(norm)) {
      city = value;
    } else if (PROVINCE_KEYS.includes(norm)) {
      province = field.options?.find((o) => o.value === value)?.label ?? value;
      if (field.type === "select") provinceCode = value;
    } else if (POSTAL_KEYS.includes(norm)) {
      zip = value;
    } else if (STREET_KEYS.includes(norm)) {
      streetParts.push(value);
    } else if (norm === ADDRESS2_KEY) {
      address2 = value;
    } else {
      // Country-specific descriptors with no fixed Address column (e.g. TR's Mahalle/İlçe) are
      // never dropped — they're folded into address2 so the shipping label stays complete.
      extraParts.push(`${field.label}: ${value}`);
    }
  }

  return {
    firstName: contact.firstName?.trim() || null,
    lastName: contact.lastName?.trim() || null,
    company: contact.company?.trim() || null,
    address1: streetParts.join(" ").trim() || city || province || "—",
    address2: [address2, ...extraParts].filter(Boolean).join(", ") || null,
    // Address.city is required, but not every country's addressSchema has a distinct
    // city-equivalent field (e.g. TR's "İl"/province serves as both) — fall back to province
    // rather than duplicating the street line, which would otherwise be the only non-empty value.
    city: city || province || streetParts[0] || "—",
    province: province || null,
    provinceCode: provinceCode || null,
    countryCode: countryCode.toUpperCase(),
    zip: zip || null,
    phone: contact.phone?.trim() || null,
  };
}
