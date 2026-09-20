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
