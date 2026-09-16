import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { currencyCodeSchema, idSchema, moneyMinorSchema, type Money } from "./primitives";

// ---- catalogs ---------------------------------------------------------------------------------

export const CATALOG_STATUSES = ["draft", "active", "archived"] as const;
export const catalogStatusSchema = z.enum(CATALOG_STATUSES);
export type CatalogStatus = z.infer<typeof catalogStatusSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const catalogFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: optionalText(1000),
  status: catalogStatusSchema,
});
export const createCatalogSchema = catalogFields.extend({
  status: catalogStatusSchema.default("draft"),
  productIds: z.array(idSchema).max(5000).optional(),
});
export type CreateCatalogInput = z.infer<typeof createCatalogSchema>;
export const updateCatalogSchema = catalogFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdateCatalogInput = z.infer<typeof updateCatalogSchema>;

export const catalogListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: catalogStatusSchema.optional(),
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

export const catalogProductsInputSchema = z.object({
  productIds: z.array(idSchema).min(1).max(5000),
});
export type CatalogProductsInput = z.infer<typeof catalogProductsInputSchema>;

export const catalogProductListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type CatalogProductListQuery = z.infer<typeof catalogProductListQuerySchema>;

// Shared by catalogs and price lists: a target is one company or one company location.
export const assignmentTargetSchema = z
  .object({
    companyId: idSchema.optional(),
    companyLocationId: idSchema.optional(),
  })
  .refine((v) => (v.companyId ? 1 : 0) + (v.companyLocationId ? 1 : 0) === 1, {
    message: "Pick a company or a company location",
    path: ["companyId"],
  });
export type AssignmentTargetInput = z.infer<typeof assignmentTargetSchema>;

export interface AssignmentSummary {
  id: string;
  company: { id: string; displayName: string } | null;
  location: { id: string; name: string; companyId: string; companyName: string } | null;
  createdAt: string;
}

export interface CatalogSummary {
  id: string;
  name: string;
  description: string | null;
  status: CatalogStatus;
  productCount: number;
  assignmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogDetail extends CatalogSummary {
  assignments: AssignmentSummary[];
}

export interface CatalogProductEntry {
  productId: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
  variantCount: number;
  image: { url: string; alt: string | null } | null;
  addedAt: string;
}

// ---- price lists ------------------------------------------------------------------------------

export const PRICE_LIST_STATUSES = ["draft", "active", "archived"] as const;
export const priceListStatusSchema = z.enum(PRICE_LIST_STATUSES);
export type PriceListStatus = z.infer<typeof priceListStatusSchema>;

// Basis points: -1000 = 10% off, 500 = 5% markup.
export const adjustmentBpsSchema = z.number().int().min(-10_000).max(100_000);

const priceListFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: optionalText(1000),
  currency: currencyCodeSchema,
  status: priceListStatusSchema,
  adjustmentBps: adjustmentBpsSchema,
  priority: z.number().int().min(0).max(1000),
});
export const createPriceListSchema = priceListFields.extend({
  currency: currencyCodeSchema.optional(),
  status: priceListStatusSchema.default("draft"),
  adjustmentBps: adjustmentBpsSchema.default(0),
  priority: z.number().int().min(0).max(1000).default(0),
});
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>;
export const updatePriceListSchema = priceListFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>;

export const priceListListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: priceListStatusSchema.optional(),
});
export type PriceListListQuery = z.infer<typeof priceListListQuerySchema>;

export const priceListPriceInputSchema = z.object({
  variantId: idSchema,
  price: moneyMinorSchema.min(0),
  compareAtPrice: moneyMinorSchema.min(0).nullable().optional(),
});
export const setPriceListPricesSchema = z.object({
  prices: z.array(priceListPriceInputSchema).min(1).max(500),
});
export type SetPriceListPricesInput = z.infer<typeof setPriceListPricesSchema>;

export const removePriceListPricesSchema = z.object({
  variantIds: z.array(idSchema).min(1).max(500),
});
export type RemovePriceListPricesInput = z.infer<typeof removePriceListPricesSchema>;

export interface PriceListSummary {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: PriceListStatus;
  adjustmentBps: number;
  priority: number;
  priceCount: number;
  assignmentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceListDetail extends PriceListSummary {
  assignments: AssignmentSummary[];
}

export interface PriceListPriceEntry {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  basePrice: Money;
  price: Money;
  compareAtPrice: Money | null;
  updatedAt: string;
}

// ---- volume pricing ---------------------------------------------------------------------------

export const PRICING_SCOPES = ["variant", "product", "collection", "store"] as const;
export const pricingScopeSchema = z.enum(PRICING_SCOPES);
export type PricingScope = z.infer<typeof pricingScopeSchema>;

export const VOLUME_TIER_TYPES = ["fixed_price", "percent_off"] as const;
export const volumeTierTypeSchema = z.enum(VOLUME_TIER_TYPES);
export type VolumeTierType = z.infer<typeof volumeTierTypeSchema>;

export const volumeTierSchema = z.object({
  minQuantity: z.number().int().min(1),
  // fixed_price: unit price in minor units; percent_off: basis points (1..10000)
  value: z.number().int().min(0),
});
export type VolumeTier = z.infer<typeof volumeTierSchema>;

const volumeRuleFields = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  scope: pricingScopeSchema,
  scopeId: idSchema.nullable().optional(),
  priceListId: idSchema.nullable().optional(),
  tierType: volumeTierTypeSchema,
  tiers: z.array(volumeTierSchema).min(1, "Add at least one tier").max(20),
  isActive: z.boolean(),
});

const tiersValid = (v: { tierType: VolumeTierType; tiers: VolumeTier[] }) => {
  for (let i = 1; i < v.tiers.length; i += 1) {
    if (v.tiers[i]!.minQuantity <= v.tiers[i - 1]!.minQuantity) return false;
  }
  return v.tierType !== "percent_off" || v.tiers.every((t) => t.value >= 1 && t.value <= 10_000);
};
const scopeValid = (v: { scope: PricingScope; scopeId?: string | null | undefined }) =>
  v.scope === "store" ? !v.scopeId : !!v.scopeId;

export const createVolumeRuleSchema = volumeRuleFields
  .extend({ isActive: z.boolean().default(true) })
  .refine(tiersValid, {
    message: "Tiers must have increasing minimum quantities (and 1–10000 bps for percent off)",
    path: ["tiers"],
  })
  .refine(scopeValid, { message: "Pick what the rule applies to", path: ["scopeId"] });
export type CreateVolumeRuleInput = z.infer<typeof createVolumeRuleSchema>;

export const updateVolumeRuleSchema = volumeRuleFields
  .omit({ scope: true, scopeId: true })
  .partial()
  .refine(
    (v) =>
      v.tiers === undefined ||
      v.tierType === undefined ||
      tiersValid({ tierType: v.tierType, tiers: v.tiers }),
    {
      message: "Tiers must have increasing minimum quantities",
      path: ["tiers"],
    },
  );
export type UpdateVolumeRuleInput = z.infer<typeof updateVolumeRuleSchema>;

export interface VolumeRuleSummary {
  id: string;
  name: string;
  scope: PricingScope;
  scopeId: string | null;
  scopeLabel: string;
  priceList: { id: string; name: string } | null;
  tierType: VolumeTierType;
  tiers: VolumeTier[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---- quantity rules ---------------------------------------------------------------------------

export const QUANTITY_RULE_SCOPES = ["variant", "product"] as const;
export const quantityRuleScopeSchema = z.enum(QUANTITY_RULE_SCOPES);
export type QuantityRuleScope = z.infer<typeof quantityRuleScopeSchema>;

const positiveInt = z.number().int().min(1).nullable().optional();
export const upsertQuantityRuleSchema = z
  .object({
    scope: quantityRuleScopeSchema,
    scopeId: idSchema,
    minQuantity: positiveInt,
    maxQuantity: positiveInt,
    increment: positiveInt,
  })
  .refine((v) => !!v.minQuantity || !!v.maxQuantity || !!v.increment, {
    message: "Set at least one of minimum, maximum or increment",
    path: ["minQuantity"],
  })
  .refine((v) => !v.minQuantity || !v.maxQuantity || v.minQuantity <= v.maxQuantity, {
    message: "Minimum cannot exceed maximum",
    path: ["maxQuantity"],
  });
export type UpsertQuantityRuleInput = z.infer<typeof upsertQuantityRuleSchema>;

export interface QuantityRuleSummary {
  id: string;
  scope: QuantityRuleScope;
  scopeId: string;
  scopeLabel: string;
  minQuantity: number | null;
  maxQuantity: number | null;
  increment: number | null;
  createdAt: string;
  updatedAt: string;
}

// ---- contract prices --------------------------------------------------------------------------

export const upsertContractPriceSchema = z
  .object({
    companyId: idSchema,
    companyLocationId: idSchema.nullable().optional(),
    variantId: idSchema,
    price: moneyMinorSchema.min(0),
    validFrom: z.string().datetime().nullable().optional(),
    validTo: z.string().datetime().nullable().optional(),
    note: optionalText(500),
  })
  .refine((v) => !v.validFrom || !v.validTo || new Date(v.validFrom) < new Date(v.validTo), {
    message: "Valid-from must be before valid-to",
    path: ["validTo"],
  });
export type UpsertContractPriceInput = z.infer<typeof upsertContractPriceSchema>;

export const contractPriceListQuerySchema = cursorPaginationQuerySchema.extend({
  companyId: idSchema.optional(),
  variantId: idSchema.optional(),
  q: z.string().trim().max(120).optional(),
});
export type ContractPriceListQuery = z.infer<typeof contractPriceListQuerySchema>;

export interface ContractPriceSummary {
  id: string;
  company: { id: string; displayName: string };
  location: { id: string; name: string } | null;
  variant: {
    id: string;
    title: string;
    sku: string | null;
    productId: string;
    productTitle: string;
  };
  price: Money;
  basePrice: Money;
  validFrom: string | null;
  validTo: string | null;
  isCurrent: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- pricing service (quotes) ----------------------------------------------------------------

export const PRICE_SOURCES = ["contract", "price_list", "volume", "base"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const pricingBuyerSchema = z.object({
  customerId: idSchema.optional(),
  companyId: idSchema.optional(),
  companyLocationId: idSchema.optional(),
});
export type PricingBuyer = z.infer<typeof pricingBuyerSchema>;

export const pricingQuoteSchema = z.object({
  buyer: pricingBuyerSchema.default({}),
  items: z
    .array(z.object({ variantId: idSchema, quantity: z.number().int().min(1).max(1_000_000) }))
    .min(1)
    .max(200),
});
export type PricingQuoteInput = z.infer<typeof pricingQuoteSchema>;

export interface QuantityRuleCheck {
  ok: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
  increment: number | null;
  // The nearest valid quantity when `ok` is false (rounded up to increment, clamped to range).
  suggestedQuantity: number | null;
  message: string | null;
}

export interface PricedItem {
  variantId: string;
  productId: string;
  quantity: number;
  visible: boolean;
  basePrice: Money;
  unitPrice: Money;
  lineTotal: Money;
  compareAtPrice: Money | null;
  source: PriceSource;
  priceListId: string | null;
  contractPriceId: string | null;
  volumeRuleId: string | null;
  appliedTier: VolumeTier | null;
  // Every tier that applies to this variant for the buyer, so storefronts can render breaks.
  tiers: { minQuantity: number; unitPrice: Money }[];
  quantityRule: QuantityRuleCheck;
}

export interface PricingQuote {
  currency: string;
  buyer: PricingBuyer & { resolvedCompanyId: string | null; resolvedLocationId: string | null };
  catalogRestricted: boolean;
  items: PricedItem[];
  subtotal: Money;
}

export interface CompanyPricingOverview {
  catalogs: {
    id: string;
    name: string;
    status: CatalogStatus;
    via: "company" | "location";
    locationName: string | null;
  }[];
  priceLists: {
    id: string;
    name: string;
    status: PriceListStatus;
    priority: number;
    adjustmentBps: number;
    via: "company" | "location";
    locationName: string | null;
  }[];
  contractPriceCount: number;
}
