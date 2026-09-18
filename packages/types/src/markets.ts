import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Use a two-letter country code");

export const marketInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().toUpperCase().length(3),
  locale: z.string().trim().min(2).max(10),
  countryCode: countryCodeSchema,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type MarketInput = z.infer<typeof marketInputSchema>;

export const updateMarketSchema = marketInputSchema.partial();
export type UpdateMarketInput = z.infer<typeof updateMarketSchema>;

export const marketListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type MarketListQuery = z.infer<typeof marketListQuerySchema>;

export interface MarketSummary {
  id: string;
  name: string;
  currency: string;
  locale: string;
  countryCode: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
