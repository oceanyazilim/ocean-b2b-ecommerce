import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a two-letter country code");

// Rates are basis points (1/100 of a percent) so 18% VAT is 1800, never a float.
export const taxRuleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countryCode: countryCodeSchema,
  provinceCode: z.string().trim().toUpperCase().max(10).nullable().optional(),
  // Which tax class (spec section 24) this rate applies to; omitted/null = applies to every
  // line at this geography that has no more specific class-matching rule (today's behavior).
  taxClassId: z.string().uuid().nullable().optional(),
  rateBps: z.number().int().min(0).max(10_000),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});
export type TaxRuleInput = z.infer<typeof taxRuleInputSchema>;

export const updateTaxRuleSchema = taxRuleInputSchema.partial();
export type UpdateTaxRuleInput = z.infer<typeof updateTaxRuleSchema>;

export const taxRuleListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type TaxRuleListQuery = z.infer<typeof taxRuleListQuerySchema>;

export interface TaxRuleSummary {
  id: string;
  name: string;
  countryCode: string;
  provinceCode: string | null;
  taxClassId: string | null;
  taxClassName: string | null;
  ratePercent: number;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export const updateTaxSettingsSchema = z.object({
  pricesIncludeTax: z.boolean(),
});
export type UpdateTaxSettingsInput = z.infer<typeof updateTaxSettingsSchema>;

// ---------------------------------------------------------------------------
// L3: Tax registrations (spec section 21, "Taxes -> Registrations")
//
// "Turkey / VAT registration / Active", "United States / Sales tax / 3 registrations" — which
// countries (and, for section 23's sub-country regions, which states/provinces) the merchant is
// tax-registered in. Terminology (`registrationType`) is free text so it can mirror
// CountryProfile.taxSystemType ("vat"/"sales_tax"/"gst") without a migration for a new
// jurisdiction; the admin UI resolves the real per-country label (KDV/MwSt/VAT/GST/Sales Tax)
// from CountryProfile.taxTerminology, never hardcoding "VAT" (spec section 22).
// ---------------------------------------------------------------------------

export const TAX_REGISTRATION_STATUSES = ["active", "not_registered", "pending"] as const;
export const taxRegistrationStatusSchema = z.enum(TAX_REGISTRATION_STATUSES);
export type TaxRegistrationStatus = z.infer<typeof taxRegistrationStatusSchema>;

export const taxRegistrationInputSchema = z.object({
  countryCode: countryCodeSchema,
  regionCode: z.string().trim().toUpperCase().max(10).nullable().optional(),
  registrationType: z.string().trim().min(1).max(80),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  status: taxRegistrationStatusSchema.default("not_registered"),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type TaxRegistrationInput = z.infer<typeof taxRegistrationInputSchema>;

export const updateTaxRegistrationSchema = taxRegistrationInputSchema.partial();
export type UpdateTaxRegistrationInput = z.infer<typeof updateTaxRegistrationSchema>;

export interface TaxRegistrationSummary {
  id: string;
  countryCode: string;
  countryName: string | null;
  // The real local term for this country's tax, from CountryProfile.taxTerminology — e.g. "KDV"
  // for Turkey, "USt./MwSt." for Germany, "Sales Tax" for the US. Null if no CountryProfile
  // exists yet for this code.
  taxTerminology: { localName: string; localFullName?: string; englishName: string } | null;
  regionCode: string | null;
  registrationType: string;
  registrationNumber: string | null;
  status: TaxRegistrationStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// One row per country for the summary list ("United States / Sales tax / 3 registrations").
export interface TaxRegistrationCountryGroup {
  countryCode: string;
  countryName: string | null;
  taxTerminology: { localName: string; localFullName?: string; englishName: string } | null;
  registrations: TaxRegistrationSummary[];
  activeCount: number;
}

// ---------------------------------------------------------------------------
// L3: Tax classes (spec section 24)
// ---------------------------------------------------------------------------

export const taxClassInputSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores")
    .max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});
export type TaxClassInput = z.infer<typeof taxClassInputSchema>;

export const updateTaxClassSchema = taxClassInputSchema.partial().omit({ code: true });
export type UpdateTaxClassInput = z.infer<typeof updateTaxClassSchema>;

export interface TaxClassSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isSystem: boolean;
  position: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}
