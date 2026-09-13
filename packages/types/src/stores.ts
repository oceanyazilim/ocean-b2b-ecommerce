import { z } from "zod";

import { currencyCodeSchema, localeSchema, slugSchema } from "./primitives";

export const storeNameSchema = z.string().trim().min(2).max(120);

// IANA zone names; validated against Intl at the API boundary as well.
export const timezoneSchema = z.string().min(1).max(64);

export const STORE_BUSINESS_TYPES = ["b2b", "wholesale", "dtc", "hybrid"] as const;
export const storeBusinessTypeSchema = z.enum(STORE_BUSINESS_TYPES);

export const createStoreSchema = z.object({
  name: storeNameSchema,
  slug: slugSchema.optional(),
  defaultCurrency: currencyCodeSchema,
  defaultLocale: localeSchema,
  timezone: timezoneSchema,
  businessType: storeBusinessTypeSchema.optional(),
  industry: z.string().trim().min(1).max(80).optional(),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const updateStoreSchema = z
  .object({
    name: storeNameSchema.optional(),
    defaultCurrency: currencyCodeSchema.optional(),
    defaultLocale: localeSchema.optional(),
    timezone: timezoneSchema.optional(),
    businessType: storeBusinessTypeSchema.optional(),
    industry: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;

export const ONBOARDING_STEPS = [
  "business_details",
  "first_product",
  "payments",
  "shipping",
  "taxes",
  "domain",
  "theme",
  "launch",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const updateOnboardingSchema = z.object({
  step: z.enum(ONBOARDING_STEPS),
  completed: z.boolean(),
});
export type UpdateOnboardingInput = z.infer<typeof updateOnboardingSchema>;

export interface StoreSummary {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string;
  defaultLocale: string;
  timezone: string;
  businessType: string | null;
  industry: string | null;
  onboardingState: Record<string, boolean>;
  createdAt: string;
}
