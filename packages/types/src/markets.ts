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
  // L4 Global Localization (spec section 8): which storefront language this market's buyers see
  // by default, and which extra languages they may switch into. Loose string references to
  // StoreLanguage.locale, not enforced by a DB foreign key — see schema.prisma's Market comment.
  defaultLanguage: z.string().trim().min(2).max(35).nullable().optional(),
  additionalLanguages: z.array(z.string().trim().min(2).max(35)).max(50).default([]),
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
  defaultLanguage: string | null;
  additionalLanguages: string[];
  createdAt: string;
  updatedAt: string;
}
