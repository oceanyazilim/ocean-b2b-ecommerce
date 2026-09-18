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
