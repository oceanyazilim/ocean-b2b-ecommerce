import { z } from "zod";

import { addressSchema, type Address } from "./addresses";
import { cursorPaginationQuerySchema } from "./api";
import type { CustomerStatus } from "./customers";
import { currencyCodeSchema, emailSchema, idSchema } from "./primitives";

// ---- companies --------------------------------------------------------------------------------

export const COMPANY_STATUSES = ["active", "suspended", "archived"] as const;
export const companyStatusSchema = z.enum(COMPANY_STATUSES);
export type CompanyStatus = z.infer<typeof companyStatusSchema>;

export const COMPANY_ROLES = ["company_admin", "buyer", "approver", "finance", "viewer"] as const;
export const companyRoleSchema = z.enum(COMPANY_ROLES);
export type CompanyRole = z.infer<typeof companyRoleSchema>;

export const COMPANY_USER_STATUSES = ["active", "disabled"] as const;
export const companyUserStatusSchema = z.enum(COMPANY_USER_STATUSES);
export type CompanyUserStatus = z.infer<typeof companyUserStatusSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50);
const websiteSchema = z
  .string()
  .trim()
  .max(200)
  .refine((v) => /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), "Enter a valid website")
  .nullable()
  .optional();

const companyFields = z.object({
  legalName: z.string().trim().min(1, "Legal name is required").max(200),
  displayName: z.string().trim().min(1).max(200),
  taxNumber: optionalText(40),
  taxOffice: optionalText(120),
  industry: optionalText(80),
  currency: currencyCodeSchema,
  status: companyStatusSchema,
  accountManagerId: idSchema.nullable().optional(),
  externalId: optionalText(80),
  website: websiteSchema,
  phone: optionalText(40),
  email: emailSchema.nullable().optional(),
  note: optionalText(2000),
  tags: tagsSchema,
});

export const companyLocationFieldsSchema = z.object({
  name: z.string().trim().min(1, "Location name is required").max(120),
  externalId: optionalText(80),
  phone: optionalText(40),
  email: emailSchema.nullable().optional(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.nullable().optional(),
  currency: currencyCodeSchema.nullable().optional(),
  taxExempt: z.boolean(),
  taxNumber: optionalText(40),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  note: optionalText(1000),
});

export const createCompanyLocationSchema = companyLocationFieldsSchema.extend({
  taxExempt: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateCompanyLocationInput = z.infer<typeof createCompanyLocationSchema>;

export const updateCompanyLocationSchema = companyLocationFieldsSchema.partial();
export type UpdateCompanyLocationInput = z.infer<typeof updateCompanyLocationSchema>;

export const createCompanySchema = companyFields
  .extend({
    displayName: z.string().trim().min(1).max(200).optional(),
    currency: currencyCodeSchema.optional(),
    status: companyStatusSchema.default("active"),
    tags: tagsSchema.default([]),
    // Optional first location so a company is orderable straight away.
    location: createCompanyLocationSchema.omit({ isDefault: true }).optional(),
  })
  .transform((v) => ({ ...v, displayName: v.displayName ?? v.legalName }));
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = companyFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const COMPANY_SORTS = [
  "created_desc",
  "created_asc",
  "updated_desc",
  "name_asc",
  "name_desc",
] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];

export const companyListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: companyStatusSchema.optional(),
  tag: z.string().trim().max(40).optional(),
  accountManagerId: idSchema.optional(),
  sort: z.enum(COMPANY_SORTS).default("created_desc"),
});
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;

export const companyStatusUpdateSchema = z.object({ status: companyStatusSchema });

export const companySearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CompanySearchQuery = z.infer<typeof companySearchQuerySchema>;

export interface CompanyLocationSummary {
  id: string;
  companyId: string;
  name: string;
  externalId: string | null;
  phone: string | null;
  email: string | null;
  shippingAddress: Address;
  billingAddress: Address | null;
  currency: string | null;
  taxExempt: boolean;
  taxNumber: string | null;
  isDefault: boolean;
  isActive: boolean;
  note: string | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySummary {
  id: string;
  legalName: string;
  displayName: string;
  taxNumber: string | null;
  industry: string | null;
  currency: string;
  status: CompanyStatus;
  externalId: string | null;
  tags: string[];
  accountManager: { id: string; name: string; email: string } | null;
  locationCount: number;
  userCount: number;
  defaultLocation: { id: string; name: string; city: string; countryCode: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetail extends CompanySummary {
  taxOffice: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  locations: CompanyLocationSummary[];
}

export interface CompanyStats {
  total: number;
  active: number;
  suspended: number;
  archived: number;
  pendingApplications: number;
}

export interface CompanyCandidate {
  id: string;
  displayName: string;
  legalName: string;
  status: CompanyStatus;
}

// ---- company users ----------------------------------------------------------------------------

// Link an existing customer, or create one on the fly from an email + name.
export const addCompanyUserSchema = z
  .object({
    customerId: idSchema.optional(),
    email: emailSchema.optional(),
    firstName: optionalText(80),
    lastName: optionalText(80),
    role: companyRoleSchema,
    title: optionalText(80),
    allLocations: z.boolean().default(true),
    locationIds: z.array(idSchema).max(200).default([]),
  })
  .refine((v) => !!v.customerId || !!v.email, {
    message: "Pick a customer or enter an email",
    path: ["customerId"],
  })
  .refine((v) => v.allLocations || v.locationIds.length > 0, {
    message: "Choose at least one location or allow all",
    path: ["locationIds"],
  });
export type AddCompanyUserInput = z.infer<typeof addCompanyUserSchema>;

export const updateCompanyUserSchema = z
  .object({
    role: companyRoleSchema.optional(),
    status: companyUserStatusSchema.optional(),
    title: optionalText(80),
    allLocations: z.boolean().optional(),
    locationIds: z.array(idSchema).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateCompanyUserInput = z.infer<typeof updateCompanyUserSchema>;

export interface CompanyUserSummary {
  id: string;
  companyId: string;
  customer: {
    id: string;
    email: string;
    displayName: string;
    status: CustomerStatus;
    hasAccount: boolean;
  };
  role: CompanyRole;
  status: CompanyUserStatus;
  title: string | null;
  allLocations: boolean;
  locations: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

// ---- applications -----------------------------------------------------------------------------

export const COMPANY_APPLICATION_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
] as const;
export const companyApplicationStatusSchema = z.enum(COMPANY_APPLICATION_STATUSES);
export type CompanyApplicationStatus = z.infer<typeof companyApplicationStatusSchema>;

export const submitCompanyApplicationSchema = z.object({
  legalName: z.string().trim().min(1, "Company name is required").max(200),
  displayName: optionalText(200),
  taxNumber: optionalText(40),
  taxOffice: optionalText(120),
  industry: optionalText(80),
  website: websiteSchema,
  expectedMonthlyVolume: optionalText(80),
  contactFirstName: z.string().trim().min(1, "First name is required").max(80),
  contactLastName: z.string().trim().min(1, "Last name is required").max(80),
  contactEmail: emailSchema,
  contactPhone: optionalText(40),
  address: addressSchema.nullable().optional(),
  message: optionalText(2000),
  documentMediaIds: z.array(idSchema).max(10).default([]),
});
export type SubmitCompanyApplicationInput = z.infer<typeof submitCompanyApplicationSchema>;

export const companyApplicationListQuerySchema = cursorPaginationQuerySchema.extend({
  status: companyApplicationStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
});
export type CompanyApplicationListQuery = z.infer<typeof companyApplicationListQuerySchema>;

export const approveCompanyApplicationSchema = z.object({
  // Overrides for what the merchant fixed up during review.
  legalName: z.string().trim().min(1).max(200).optional(),
  displayName: optionalText(200),
  taxNumber: optionalText(40),
  taxOffice: optionalText(120),
  industry: optionalText(80),
  currency: currencyCodeSchema.optional(),
  accountManagerId: idSchema.nullable().optional(),
  locationName: z.string().trim().min(1).max(120).optional(),
  address: addressSchema.optional(),
  note: optionalText(2000),
});
export type ApproveCompanyApplicationInput = z.infer<typeof approveCompanyApplicationSchema>;

export const rejectCompanyApplicationSchema = z.object({
  note: z.string().trim().min(1, "Tell the applicant why").max(2000),
});
export type RejectCompanyApplicationInput = z.infer<typeof rejectCompanyApplicationSchema>;

export interface CompanyApplicationSummary {
  id: string;
  status: CompanyApplicationStatus;
  source: "storefront" | "admin";
  legalName: string;
  displayName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  industry: string | null;
  website: string | null;
  expectedMonthlyVolume: string | null;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string | null;
  address: Address | null;
  message: string | null;
  documents: { mediaId: string; name: string; url: string; mime: string }[];
  reviewer: { id: string; name: string } | null;
  reviewedAt: string | null;
  decisionNote: string | null;
  companyId: string | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountManagerCandidate {
  id: string;
  name: string;
  email: string;
}
