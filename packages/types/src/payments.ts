import { z } from "zod";

import { idSchema, moneyMinorSchema, type Money } from "./primitives";

// ---- payment methods (store settings) ------------------------------------------------------

// Adapter keys registered in the API. New PSPs register a new provider string; the UI never
// hard-codes provider-specific fields beyond a free-form config blob.
export const PAYMENT_PROVIDERS = ["manual", "test"] as const;
export const paymentProviderSchema = z.enum(PAYMENT_PROVIDERS);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const paymentMethodInputSchema = z.object({
  provider: paymentProviderSchema,
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2000).nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  isEnabled: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodInputSchema>;

export const updatePaymentMethodSchema = paymentMethodInputSchema.partial();
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;

export interface PaymentMethodSummary {
  id: string;
  provider: PaymentProvider;
  name: string;
  instructions: string | null;
  isEnabled: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

// ---- payments (per order) -------------------------------------------------------------------

export const PAYMENT_RECORD_STATUSES = [
  "pending",
  "authorized",
  "captured",
  "voided",
  "failed",
] as const;
export const paymentRecordStatusSchema = z.enum(PAYMENT_RECORD_STATUSES);
export type PaymentRecordStatus = z.infer<typeof paymentRecordStatusSchema>;

export interface PaymentTransactionEntry {
  id: string;
  kind: "authorize" | "capture" | "void" | "refund";
  status: "succeeded" | "failed" | "pending";
  amount: Money;
  providerRef: string | null;
  createdAt: string;
}

export interface PaymentSummary {
  id: string;
  provider: PaymentProvider;
  methodName: string;
  status: PaymentRecordStatus;
  amount: Money;
  capturedAmount: Money;
  refundedAmount: Money;
  providerRef: string | null;
  failureReason: string | null;
  transactions: PaymentTransactionEntry[];
  createdAt: string;
}

export const createPaymentSchema = z.object({
  paymentMethodId: idSchema,
  amount: moneyMinorSchema.min(1).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const confirmPaymentSchema = z.object({
  providerRef: z.string().trim().max(200).nullable().optional(),
});
export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

// ---- refunds ------------------------------------------------------------------------------

export const REFUND_STATUSES = ["pending", "succeeded", "failed"] as const;
export const refundStatusSchema = z.enum(REFUND_STATUSES);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const refundLineInputSchema = z.object({
  orderItemId: idSchema,
  quantity: z.number().int().min(1),
});
export type RefundLineInput = z.infer<typeof refundLineInputSchema>;

export const createRefundSchema = z.object({
  amount: moneyMinorSchema.min(1),
  reason: z.string().trim().max(500).nullable().optional(),
  restock: z.boolean().default(false),
  items: z.array(refundLineInputSchema).max(200).default([]),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

export interface RefundLineSummary {
  orderItemId: string;
  quantity: number;
}

export interface RefundSummary {
  id: string;
  amount: Money;
  reason: string | null;
  status: RefundStatus;
  restock: boolean;
  items: RefundLineSummary[];
  createdAt: string;
}
