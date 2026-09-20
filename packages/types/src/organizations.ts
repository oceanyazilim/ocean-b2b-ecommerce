import { z } from "zod";

import { countryCodeSchema } from "./countries";
import { slugSchema } from "./primitives";

export const organizationNameSchema = z.string().trim().min(2).max(120);

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  slug: slugSchema.optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z
  .object({
    name: organizationNameSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Merchant business-profile onboarding (L2 of the localization initiative, spec sections
// 11/12/17-19). The actual answers a merchant submits, shaped by whichever CountryProfile they
// picked — one generic record type for every country, never a per-country interface. Values are
// validated server-side against that country's real businessProfileSchema/addressSchema (see
// OrganizationsService.updateBusinessProfile) before being stored.
// ---------------------------------------------------------------------------

const businessProfileAnswerValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
// key -> answer, keyed by the selected CountryProfile's businessProfileSchema[].key.
export const businessProfileAnswersSchema = z.record(z.string(), businessProfileAnswerValueSchema);
export type BusinessProfileAnswers = z.infer<typeof businessProfileAnswersSchema>;

// key -> answer, keyed by the selected CountryProfile's addressSchema[].key.
export const businessAddressAnswersSchema = z.record(z.string(), z.string());
export type BusinessAddressAnswers = z.infer<typeof businessAddressAnswersSchema>;

export const updateBusinessProfileSchema = z.object({
  countryCode: countryCodeSchema,
  // One of the selected country's businessEntityTypes[].code — checked against the real list
  // server-side, not just this shape.
  businessEntityType: z.string().trim().min(1, "Select how your business is registered"),
  businessProfile: businessProfileAnswersSchema.default({}),
  businessAddress: businessAddressAnswersSchema.default({}),
});
export type UpdateBusinessProfileInput = z.infer<typeof updateBusinessProfileSchema>;

export interface OrganizationBusinessProfile {
  countryCode: string | null;
  businessEntityType: string | null;
  businessProfile: BusinessProfileAnswers;
  businessAddress: BusinessAddressAnswers;
  businessProfileCompletedAt: string | null;
}

// ---------------------------------------------------------------------------
// Business verification (L5 of the localization initiative, spec section 30). A completeness
// view derived from real data this platform already collects (L2 business profile/address, L3
// tax registrations) — never a real identity/KYC or banking integration. See
// OrganizationsService.getBusinessVerification / business-verification.ts for the computation;
// categories whose status is "not_collected" mean this platform genuinely has no data source for
// that category yet (identity documents, bank accounts), not that the merchant failed a check.
// ---------------------------------------------------------------------------

export const BUSINESS_VERIFICATION_STATUSES = ["unverified", "action_required", "verified"] as const;
export const businessVerificationStatusSchema = z.enum(BUSINESS_VERIFICATION_STATUSES);
export type BusinessVerificationStatus = z.infer<typeof businessVerificationStatusSchema>;

export const BUSINESS_VERIFICATION_CATEGORY_STATUSES = [
  "complete",
  "action_required",
  "not_collected",
] as const;
export const businessVerificationCategoryStatusSchema = z.enum(BUSINESS_VERIFICATION_CATEGORY_STATUSES);
export type BusinessVerificationCategoryStatus = z.infer<typeof businessVerificationCategoryStatusSchema>;

// Which real settings page resolves a gap in this category — undefined when there's genuinely
// nowhere to send the merchant yet (identity verification, banking information).
export const BUSINESS_VERIFICATION_SETTINGS_PAGES = ["business", "taxes"] as const;
export type BusinessVerificationSettingsPage = (typeof BUSINESS_VERIFICATION_SETTINGS_PAGES)[number];

export const BUSINESS_VERIFICATION_CATEGORY_KEYS = [
  "business_information",
  "authorized_representative",
  "identity_verification",
  "tax_information",
  "address_verification",
  "banking_information",
] as const;
export type BusinessVerificationCategoryKey = (typeof BUSINESS_VERIFICATION_CATEGORY_KEYS)[number];

export interface BusinessVerificationCategory {
  key: BusinessVerificationCategoryKey;
  label: string;
  status: BusinessVerificationCategoryStatus;
  message: string;
  settingsPage?: BusinessVerificationSettingsPage;
}

export interface OrganizationBusinessVerification {
  status: BusinessVerificationStatus;
  checkedAt: string;
  categories: BusinessVerificationCategory[];
}
