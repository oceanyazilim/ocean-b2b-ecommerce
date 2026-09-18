import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { moneyMinorSchema, type Money } from "./primitives";

// ---- shipping zones ------------------------------------------------------------------------

const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(\*|[A-Z]{2})$/, "Use a two-letter country code or * for everywhere else");

export const shippingZoneInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  countries: z.array(countryCodeSchema).max(250).default([]),
  isActive: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});
export type ShippingZoneInput = z.infer<typeof shippingZoneInputSchema>;

export const updateShippingZoneSchema = shippingZoneInputSchema.partial();
export type UpdateShippingZoneInput = z.infer<typeof updateShippingZoneSchema>;

export interface ShippingZoneSummary {
  id: string;
  name: string;
  countries: string[];
  isActive: boolean;
  position: number;
  rateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingRateSummary {
  id: string;
  zoneId: string;
  name: string;
  description: string | null;
  type: ShippingRateType;
  price: Money;
  minSubtotal: Money | null;
  maxSubtotal: Money | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingZoneDetail extends ShippingZoneSummary {
  rates: ShippingRateSummary[];
}

export const SHIPPING_RATE_TYPES = [
  "flat",
  "free",
  "weight_based",
  "price_based",
  "pickup",
  "freight",
] as const;
export const shippingRateTypeSchema = z.enum(SHIPPING_RATE_TYPES);
export type ShippingRateType = z.infer<typeof shippingRateTypeSchema>;

export const shippingRateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable().optional(),
    type: shippingRateTypeSchema.default("flat"),
    price: moneyMinorSchema.min(0).default(0),
    minSubtotal: moneyMinorSchema.min(0).nullable().optional(),
    maxSubtotal: moneyMinorSchema.min(0).nullable().optional(),
    minWeightGrams: z.number().int().min(0).nullable().optional(),
    maxWeightGrams: z.number().int().min(0).nullable().optional(),
    isActive: z.boolean().default(true),
    position: z.number().int().min(0).default(0),
  })
  .refine((v) => v.type !== "free" || v.price === 0, {
    message: "Free rates must be priced at 0",
    path: ["price"],
  });
export type ShippingRateInput = z.infer<typeof shippingRateInputSchema>;

export const updateShippingRateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  type: shippingRateTypeSchema.optional(),
  price: moneyMinorSchema.min(0).optional(),
  minSubtotal: moneyMinorSchema.min(0).nullable().optional(),
  maxSubtotal: moneyMinorSchema.min(0).nullable().optional(),
  minWeightGrams: z.number().int().min(0).nullable().optional(),
  maxWeightGrams: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});
export type UpdateShippingRateInput = z.infer<typeof updateShippingRateSchema>;

export const shippingZoneListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type ShippingZoneListQuery = z.infer<typeof shippingZoneListQuerySchema>;

// A rate quoted for a specific cart/draft order, with eligibility already applied.
export interface EligibleShippingRate {
  id: string;
  zoneId: string;
  zoneName: string;
  name: string;
  description: string | null;
  type: ShippingRateType;
  price: Money;
}
