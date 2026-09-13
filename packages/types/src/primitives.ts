import { z } from "zod";

export const idSchema = z.string().uuid();
export type Id = z.infer<typeof idSchema>;

export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase letters, numbers and single dashes");

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

// ISO 4217. Never hard-code a currency elsewhere; pass it through the market/store config.
export const currencyCodeSchema = z.string().length(3).toUpperCase();

// ISO 639-1 with optional region, e.g. "tr", "en-GB".
export const localeSchema = z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/);

// Monetary amounts move through the API as integer minor units to avoid float drift.
export const moneyMinorSchema = z.number().int();
export const moneySchema = z.object({
  amount: moneyMinorSchema,
  currency: currencyCodeSchema,
});
export type Money = z.infer<typeof moneySchema>;
