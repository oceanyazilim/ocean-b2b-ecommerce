import { z } from "zod";

import type { Money } from "./primitives";

export const PLAN_STATUSES = ["active", "archived"] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export interface PlanPrice {
  monthly: number;
  yearly: number;
}
export type PlanPrices = Record<string, PlanPrice>;

export interface PlanSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  prices: PlanPrices | null;
  status: PlanStatus;
  entitlements: Record<string, unknown>;
}

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export interface SubscriptionUsage {
  storesUsed: number;
  storesMax: number | null;
  staffUsed: number;
  staffMax: number | null;
}

export interface SubscriptionDetail {
  id: string;
  status: SubscriptionStatus;
  plan: PlanSummary;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAt: string | null;
  canceledAt: string | null;
  usage: SubscriptionUsage;
}

export const changePlanInputSchema = z.object({ planId: z.string().uuid() });
export type ChangePlanInput = z.infer<typeof changePlanInputSchema>;

export const PLATFORM_INVOICE_STATUSES = ["open", "paid", "void"] as const;
export const platformInvoiceStatusSchema = z.enum(PLATFORM_INVOICE_STATUSES);
export type PlatformInvoiceStatus = z.infer<typeof platformInvoiceStatusSchema>;

export interface PlatformInvoiceSummary {
  id: string;
  amount: Money;
  status: PlatformInvoiceStatus;
  dueAt: string;
  paidAt: string | null;
  createdAt: string;
}

export interface FeatureFlagSummary {
  key: string;
  description: string | null;
  enabled: boolean;
  overridden: boolean;
}

export const setFeatureFlagInputSchema = z.object({ enabled: z.boolean() });
export type SetFeatureFlagInput = z.infer<typeof setFeatureFlagInputSchema>;
