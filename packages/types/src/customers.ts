import { z } from "zod";

import { addressSchema, type Address } from "./addresses";
import { cursorPaginationQuerySchema } from "./api";
import { emailSchema, idSchema, localeSchema, type Money } from "./primitives";

export const CUSTOMER_STATUSES = ["active", "disabled"] as const;
export const customerStatusSchema = z.enum(CUSTOMER_STATUSES);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

export const MARKETING_CONSENTS = ["not_subscribed", "subscribed", "unsubscribed"] as const;
export const marketingConsentSchema = z.enum(MARKETING_CONSENTS);
export type MarketingConsent = z.infer<typeof marketingConsentSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50);

// Default-free shape shared by create and update (see products.ts for why).
const customerFields = z.object({
  email: emailSchema,
  firstName: optionalText(80),
  lastName: optionalText(80),
  phone: optionalText(40),
  status: customerStatusSchema,
  tags: tagsSchema,
  note: optionalText(2000),
  locale: localeSchema.nullable().optional(),
  taxExempt: z.boolean(),
  emailMarketing: marketingConsentSchema,
});

export const createCustomerSchema = customerFields.extend({
  status: customerStatusSchema.default("active"),
  tags: tagsSchema.default([]),
  taxExempt: z.boolean().default(false),
  emailMarketing: marketingConsentSchema.default("not_subscribed"),
  addresses: z.array(addressSchema).max(10).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = customerFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const CUSTOMER_SORTS = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "name_asc",
  "name_desc",
  "spent_desc",
] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_KINDS = ["individual", "company_buyer"] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const customerListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: customerStatusSchema.optional(),
  kind: z.enum(CUSTOMER_KINDS).optional(),
  tag: z.string().trim().max(40).optional(),
  companyId: idSchema.optional(),
  sort: z.enum(CUSTOMER_SORTS).default("created_desc"),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const CUSTOMER_BULK_ACTIONS = [
  "add_tag",
  "remove_tag",
  "disable",
  "enable",
  "delete",
] as const;
export const customerBulkActionSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(100),
    action: z.enum(CUSTOMER_BULK_ACTIONS),
    tag: z.string().trim().min(1).max(40).optional(),
  })
  .refine((v) => !v.action.endsWith("_tag") || !!v.tag, {
    message: "Tag is required for tag actions",
    path: ["tag"],
  });
export type CustomerBulkAction = z.infer<typeof customerBulkActionSchema>;

export const customerAddressInputSchema = z.object({
  address: addressSchema,
  isDefaultShipping: z.boolean().default(false),
  isDefaultBilling: z.boolean().default(false),
});
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;

export const updateCustomerAddressSchema = z
  .object({
    address: addressSchema.optional(),
    isDefaultShipping: z.boolean().optional(),
    isDefaultBilling: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

export const customerSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CustomerSearchQuery = z.infer<typeof customerSearchQuerySchema>;

export interface CustomerAddressSummary {
  id: string;
  address: Address;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCompanyMembership {
  companyUserId: string;
  companyId: string;
  companyName: string;
  companyStatus: string;
  role: string;
  status: string;
  allLocations: boolean;
  locationNames: string[];
}

export interface CustomerSummary {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  phone: string | null;
  status: CustomerStatus;
  kind: CustomerKind;
  tags: string[];
  emailMarketing: MarketingConsent;
  taxExempt: boolean;
  hasAccount: boolean;
  ordersCount: number;
  totalSpent: Money;
  lastOrderAt: string | null;
  defaultAddress: Address | null;
  companyCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  note: string | null;
  locale: string | null;
  emailMarketingUpdatedAt: string | null;
  addresses: CustomerAddressSummary[];
  companies: CustomerCompanyMembership[];
}

export interface CustomerStats {
  total: number;
  active: number;
  disabled: number;
  companyBuyers: number;
  subscribed: number;
}

export interface CustomerCandidate {
  id: string;
  email: string;
  displayName: string;
  status: CustomerStatus;
}
