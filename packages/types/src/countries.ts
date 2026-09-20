import { z } from "zod";

// ---------------------------------------------------------------------------
// Global Localization: Country Engine (L1 foundation)
//
// Shapes for @ocean/db's CountryProfile.*  Json columns, shared so a future frontend phase can
// build forms directly from this data (spec section 17: "The frontend should generate the form
// automatically based on schema data") without redefining these shapes.
// ---------------------------------------------------------------------------

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a two-letter ISO 3166-1 alpha-2 country code");

// ---- address schema (spec section 19) ---------------------------------------------------------

export const ADDRESS_FIELD_INPUT_TYPES = ["text", "select"] as const;
export const addressFieldInputTypeSchema = z.enum(ADDRESS_FIELD_INPUT_TYPES);
export type AddressFieldInputType = z.infer<typeof addressFieldInputTypeSchema>;

// One field of a country's address form, e.g. TR's "Mahalle" or US's "State". Rendered in
// declaration order by the (future) dynamic address form.
export const addressFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: addressFieldInputTypeSchema.default("text"),
  required: z.boolean().default(false),
  maxLength: z.number().int().positive().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type AddressFieldDefinition = z.infer<typeof addressFieldDefinitionSchema>;
export const addressSchemaFieldsSchema = z.array(addressFieldDefinitionSchema);

// Shared required/maxLength/select-option validation for one AddressFieldDefinition. Both the
// admin's business-address form (apps/admin/components/address-schema-form.tsx) and the
// storefront's checkout address form (apps/storefront/lib/address-schema.ts) render the exact
// same AddressFieldDefinition shape and need the exact same rule set, so it lives here once
// rather than being reimplemented per app. Message text is left to the caller (via `messages`)
// since each app localizes/phrases errors differently — only the validation rule itself is
// shared.
export interface AddressFieldValidationMessages {
  required: (label: string) => string;
  invalid: (label: string, field: AddressFieldDefinition) => string;
}

export function validateAddressField(
  field: AddressFieldDefinition,
  rawValue: string | undefined,
  messages: AddressFieldValidationMessages,
): string | null {
  const value = (rawValue ?? "").trim();
  if (field.required && !value) return messages.required(field.label);
  if (value && field.maxLength && value.length > field.maxLength) return messages.invalid(field.label, field);
  if (value && field.type === "select" && field.options && !field.options.some((o) => o.value === value)) {
    return messages.invalid(field.label, field);
  }
  return null;
}

// ---- postal code rules ---------------------------------------------------------------------

export const postalCodeRulesSchema = z.object({
  regex: z.string().optional(),
  example: z.string().optional(),
  description: z.string().optional(),
});
export type PostalCodeRules = z.infer<typeof postalCodeRulesSchema>;

// ---- tax terminology & id formats -------------------------------------------------------------

export const TAX_SYSTEM_TYPES = ["vat", "gst", "sales_tax", "none"] as const;
export const taxSystemTypeSchema = z.enum(TAX_SYSTEM_TYPES);
export type TaxSystemType = z.infer<typeof taxSystemTypeSchema>;

// The real local term for the country's tax, e.g. { localName: "KDV", localFullName: "Katma
// Değer Vergisi", englishName: "VAT" } for Turkey.
export const taxTerminologySchema = z.object({
  localName: z.string().min(1),
  localFullName: z.string().optional(),
  englishName: z.string().min(1),
});
export type TaxTerminology = z.infer<typeof taxTerminologySchema>;

export const taxIdFormatSchema = z.object({
  code: z.string().min(1), // e.g. "VKN", "EIN", "VAT_NUMBER"
  label: z.string().min(1), // e.g. "Vergi Kimlik Numarası"
  regex: z.string().optional(),
  example: z.string().optional(),
  description: z.string().optional(),
  // Business entity type codes this id format applies to; omitted/empty = applies to all.
  appliesToEntityTypes: z.array(z.string()).optional(),
});
export type TaxIdFormat = z.infer<typeof taxIdFormatSchema>;

// ---- business entity types --------------------------------------------------------------------

export const businessEntityTypeSchema = z.object({
  code: z.string().min(1), // e.g. "limited_sirket"
  label: z.string().min(1), // e.g. "Limited Şirket"
});
export type BusinessEntityType = z.infer<typeof businessEntityTypeSchema>;

// ---- business profile / country-specific form engine (spec section 17) ------------------------

export const BUSINESS_PROFILE_FIELD_INPUT_TYPES = [
  "text",
  "number",
  "email",
  "phone",
  "select",
  "date",
  "checkbox",
  "textarea",
] as const;
export const businessProfileFieldInputTypeSchema = z.enum(BUSINESS_PROFILE_FIELD_INPUT_TYPES);
export type BusinessProfileFieldInputType = z.infer<typeof businessProfileFieldInputTypeSchema>;

// A field is shown only when the buyer's chosen business entity type is one of these codes;
// omitted/empty = always visible. The "entity type dependency" spec section 17 asks for.
export const businessProfileFieldVisibilityRuleSchema = z.object({
  entityTypeIn: z.array(z.string()).optional(),
});
export type BusinessProfileFieldVisibilityRule = z.infer<
  typeof businessProfileFieldVisibilityRuleSchema
>;

// One field of a country's dynamic business-profile form, e.g.
// businessProfileSchema['TR'] -> [{ key: "vknOrTckn", label: "VKN / TCKN", ... }].
export const businessProfileFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false),
  inputType: businessProfileFieldInputTypeSchema,
  validationRegex: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  visibilityRules: businessProfileFieldVisibilityRuleSchema.optional(),
});
export type BusinessProfileFieldDefinition = z.infer<typeof businessProfileFieldDefinitionSchema>;
export const businessProfileSchemaFieldsSchema = z.array(businessProfileFieldDefinitionSchema);

// ---- CountryProfile ------------------------------------------------------------------------

export const countryProfileSummarySchema = z.object({
  id: z.string(),
  countryCode: countryCodeSchema,
  name: z.string(),
  isActive: z.boolean(),
  version: z.string(),
  supportedCurrencies: z.array(z.string()),
  supportedLanguages: z.array(z.string()),
  taxSystemType: z.string(),
  taxTerminology: taxTerminologySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CountryProfileSummary = z.infer<typeof countryProfileSummarySchema>;

// The full profile: everything a merchant onboarding form, address form or tax terminology
// lookup needs for one country. Returned by GET /countries/:code and by
// CountryProfilesService.getCountryProfile() for other backend services to call directly.
export interface CountryProfileDetail extends CountryProfileSummary {
  addressSchema: AddressFieldDefinition[];
  postalCodeRules: PostalCodeRules | null;
  stateProvinceRequired: boolean;
  stateProvinceLabel: string | null;
  taxIdFormats: TaxIdFormat[];
  supportedPaymentMethods: string[];
  businessEntityTypes: BusinessEntityType[];
  businessProfileSchema: BusinessProfileFieldDefinition[];
}
