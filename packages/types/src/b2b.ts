import { z } from "zod";

import { cursorPaginationQuerySchema } from "./api";
import { currencyCodeSchema, idSchema, moneyMinorSchema, type Money } from "./primitives";

// ---- quotes ---------------------------------------------------------------------------------

export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const;
export const quoteStatusSchema = z.enum(QUOTE_STATUSES);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const quoteLineInputSchema = z.object({
  variantId: idSchema,
  quantity: z.number().int().min(1),
  unitPrice: moneyMinorSchema.min(0),
  discount: moneyMinorSchema.min(0).default(0),
  note: z.string().trim().max(500).nullable().optional(),
});
export type QuoteLineInput = z.infer<typeof quoteLineInputSchema>;

export const createQuoteInputSchema = z.object({
  companyId: idSchema,
  companyLocationId: idSchema.nullable().optional(),
  customerId: idSchema,
  currency: currencyCodeSchema,
  expiresAt: z.string().datetime().nullable().optional(),
  paymentTerms: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2000).nullable().optional(),
  internalNotes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(quoteLineInputSchema).max(200).default([]),
});
export type CreateQuoteInput = z.infer<typeof createQuoteInputSchema>;

// Status is never set through the general update — send/accept/decline/expire are the only
// legal transitions and each has its own endpoint so the state machine can't be bypassed.
export const updateQuoteInputSchema = z.object({
  companyLocationId: idSchema.nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  paymentTerms: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  internalNotes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(quoteLineInputSchema).max(200).optional(),
});
export type UpdateQuoteInput = z.infer<typeof updateQuoteInputSchema>;

export const declineQuoteSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});
export type DeclineQuoteInput = z.infer<typeof declineQuoteSchema>;

export const quoteListQuerySchema = cursorPaginationQuerySchema.extend({
  status: quoteStatusSchema.optional(),
  companyId: idSchema.optional(),
});
export type QuoteListQuery = z.infer<typeof quoteListQuerySchema>;

export interface QuoteLineSummary {
  id: string;
  variantId: string;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: Money;
  discount: Money;
  lineTotal: Money;
  note: string | null;
}

export interface QuoteSummary {
  id: string;
  number: string;
  status: QuoteStatus;
  companyId: string;
  companyName: string;
  customerId: string;
  currency: string;
  total: Money;
  expiresAt: string | null;
  convertedOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteDetail extends QuoteSummary {
  companyLocationId: string | null;
  paymentTerms: Record<string, unknown>;
  notes: string | null;
  internalNotes: string | null;
  items: QuoteLineSummary[];
}

// ---- credit -----------------------------------------------------------------------------------

export const CREDIT_EXCEED_POLICIES = ["reject", "warn", "allow"] as const;
export const creditExceedPolicySchema = z.enum(CREDIT_EXCEED_POLICIES);
export type CreditExceedPolicy = z.infer<typeof creditExceedPolicySchema>;

export const createCreditAccountInputSchema = z
  .object({
    companyId: idSchema.nullable().optional(),
    companyLocationId: idSchema.nullable().optional(),
    limit: moneyMinorSchema.min(0),
    currency: currencyCodeSchema,
    onExceedPolicy: creditExceedPolicySchema.default("reject"),
  })
  .refine((v) => !!v.companyId !== !!v.companyLocationId, {
    message: "Set exactly one of companyId or companyLocationId",
    path: ["companyId"],
  });
export type CreateCreditAccountInput = z.infer<typeof createCreditAccountInputSchema>;

export const updateCreditAccountSchema = z.object({
  limit: moneyMinorSchema.min(0).optional(),
  onExceedPolicy: creditExceedPolicySchema.optional(),
});
export type UpdateCreditAccountInput = z.infer<typeof updateCreditAccountSchema>;

export const adjustCreditSchema = z.object({
  delta: moneyMinorSchema,
  note: z.string().trim().max(500).nullable().optional(),
});
export type AdjustCreditInput = z.infer<typeof adjustCreditSchema>;

export interface CreditLedgerEntry {
  id: string;
  delta: Money;
  referenceType: string;
  referenceId: string;
  createdAt: string;
}

export interface CreditAccountSummary {
  id: string;
  companyId: string | null;
  companyLocationId: string | null;
  limit: Money;
  used: Money;
  available: Money;
  onExceedPolicy: CreditExceedPolicy;
  createdAt: string;
}

export interface CreditAccountDetail extends CreditAccountSummary {
  ledger: CreditLedgerEntry[];
}

// ---- approvals ----------------------------------------------------------------------------

// Kept intentionally small and structured (not free-form JSON) so it stays typed end to end;
// extend with more fields as real rules need them.
export const approvalConditionsSchema = z.object({
  minTotal: moneyMinorSchema.min(0).optional(),
});
export type ApprovalConditions = z.infer<typeof approvalConditionsSchema>;

export const approvalRuleInputSchema = z.object({
  companyId: idSchema.nullable().optional(),
  conditions: approvalConditionsSchema,
  approverRoles: z.array(z.string().trim().min(1)).max(20).default([]),
});
export type ApprovalRuleInput = z.infer<typeof approvalRuleInputSchema>;

export const updateApprovalRuleSchema = approvalRuleInputSchema.partial();
export type UpdateApprovalRuleInput = z.infer<typeof updateApprovalRuleSchema>;

export interface ApprovalRuleSummary {
  id: string;
  companyId: string | null;
  conditions: ApprovalConditions;
  approverRoles: string[];
  createdAt: string;
}

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const decideApprovalSchema = z.object({
  note: z.string().trim().max(1000).nullable().optional(),
});
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;

export const approvalListQuerySchema = cursorPaginationQuerySchema.extend({
  status: approvalStatusSchema.optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

export interface ApprovalSummary {
  id: string;
  status: ApprovalStatus;
  ruleId: string;
  orderId: string | null;
  orderName: string | null;
  decidedBy: { id: string; name: string } | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

// ---- finance (invoices) --------------------------------------------------------------------

export const INVOICE_STATUSES = ["pending", "paid", "overdue", "cancelled"] as const;
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const createInvoiceInputSchema = z.object({
  orderId: idSchema,
  dueAt: z.string().datetime(),
  amount: moneyMinorSchema.min(1).optional(),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>;

export const recordInvoicePaymentSchema = z.object({
  paymentId: idSchema,
  amount: moneyMinorSchema.min(1),
});
export type RecordInvoicePaymentInput = z.infer<typeof recordInvoicePaymentSchema>;

export const invoiceListQuerySchema = cursorPaginationQuerySchema.extend({
  status: invoiceStatusSchema.optional(),
  companyId: idSchema.optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export interface InvoicePaymentEntry {
  id: string;
  amount: Money;
  createdAt: string;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  orderId: string;
  companyId: string;
  status: InvoiceStatus;
  amount: Money;
  paidAmount: Money;
  balance: Money;
  dueAt: string;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  payments: InvoicePaymentEntry[];
}

// ---- discounts ----------------------------------------------------------------------------

export const DISCOUNT_TYPES = ["percentage", "fixed_amount", "free_shipping"] as const;
export const discountTypeSchema = z.enum(DISCOUNT_TYPES);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const DISCOUNT_METHODS = ["code", "automatic"] as const;
export const discountMethodSchema = z.enum(DISCOUNT_METHODS);
export type DiscountMethod = z.infer<typeof discountMethodSchema>;

export const discountValueSchema = z.object({
  amount: moneyMinorSchema.min(0).optional(),
  percent: z.number().min(0).max(100).optional(),
});
export type DiscountValue = z.infer<typeof discountValueSchema>;

export const discountConditionsSchema = z.object({
  minSubtotal: moneyMinorSchema.min(0).optional(),
});
export type DiscountConditions = z.infer<typeof discountConditionsSchema>;

export const createDiscountInputSchema = z
  .object({
    type: discountTypeSchema,
    method: discountMethodSchema,
    value: discountValueSchema,
    conditions: discountConditionsSchema.default({}),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    code: z.string().trim().toUpperCase().min(3).max(50).optional(),
  })
  .refine((v) => v.method !== "code" || !!v.code, {
    message: "A code is required for method 'code'",
    path: ["code"],
  })
  .refine((v) => v.type !== "percentage" || v.value.percent !== undefined, {
    message: "Percentage discounts need value.percent",
    path: ["value", "percent"],
  })
  .refine((v) => v.type !== "fixed_amount" || v.value.amount !== undefined, {
    message: "Fixed-amount discounts need value.amount",
    path: ["value", "amount"],
  });
export type CreateDiscountInput = z.infer<typeof createDiscountInputSchema>;

export const updateDiscountInputSchema = z.object({
  value: discountValueSchema.optional(),
  conditions: discountConditionsSchema.optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
});
export type UpdateDiscountInput = z.infer<typeof updateDiscountInputSchema>;

export type DiscountStatus = "scheduled" | "active" | "expired";

export const validateDiscountCodeSchema = z.object({
  code: z.string().trim().min(1).max(50),
  subtotal: moneyMinorSchema.min(0),
});
export type ValidateDiscountCodeInput = z.infer<typeof validateDiscountCodeSchema>;

export interface DiscountSummary {
  id: string;
  type: DiscountType;
  method: DiscountMethod;
  value: DiscountValue;
  conditions: DiscountConditions;
  codes: string[];
  status: DiscountStatus;
  startsAt: string;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  createdAt: string;
}

export interface DiscountCodeValidation {
  discount: DiscountSummary;
  amount: Money;
}

// ---- saved lists (quick order) -------------------------------------------------------------

export const savedListItemInputSchema = z.object({
  variantId: idSchema,
  quantity: z.number().int().min(1),
});
export type SavedListItemInput = z.infer<typeof savedListItemInputSchema>;

export const createSavedListInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customerId: idSchema.nullable().optional(),
  companyId: idSchema.nullable().optional(),
  items: z.array(savedListItemInputSchema).max(200).default([]),
});
export type CreateSavedListInput = z.infer<typeof createSavedListInputSchema>;

export const updateSavedListSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});
export type UpdateSavedListInput = z.infer<typeof updateSavedListSchema>;

export const addToCartFromListSchema = z.object({
  cartId: idSchema,
});
export type AddToCartFromListInput = z.infer<typeof addToCartFromListSchema>;

export const updateSavedListItemSchema = z.object({
  quantity: z.number().int().min(1),
});
export type UpdateSavedListItemInput = z.infer<typeof updateSavedListItemSchema>;

export interface SavedListItemSummary {
  id: string;
  variantId: string;
  title: string;
  sku: string | null;
  quantity: number;
}

export interface SavedListSummary {
  id: string;
  name: string;
  customerId: string | null;
  companyId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedListDetail extends SavedListSummary {
  items: SavedListItemSummary[];
}
