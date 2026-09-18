import { z } from "zod";

import { idSchema } from "./primitives";

// ---- fulfillments ---------------------------------------------------------------------------

export const FULFILLMENT_STATES = ["pending", "shipped", "delivered", "cancelled"] as const;
export const fulfillmentStateSchema = z.enum(FULFILLMENT_STATES);
export type FulfillmentState = z.infer<typeof fulfillmentStateSchema>;

export const fulfillmentLineInputSchema = z.object({
  orderItemId: idSchema,
  quantity: z.number().int().min(1),
});
export type FulfillmentLineInput = z.infer<typeof fulfillmentLineInputSchema>;

export const createFulfillmentSchema = z.object({
  locationId: idSchema.nullable().optional(),
  items: z.array(fulfillmentLineInputSchema).min(1).max(200),
  trackingCarrier: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  trackingUrl: z.string().trim().url().max(500).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type CreateFulfillmentInput = z.infer<typeof createFulfillmentSchema>;

export const updateFulfillmentTrackingSchema = z.object({
  trackingCarrier: z.string().trim().max(120).nullable().optional(),
  trackingNumber: z.string().trim().max(120).nullable().optional(),
  trackingUrl: z.string().trim().url().max(500).nullable().optional(),
});
export type UpdateFulfillmentTrackingInput = z.infer<typeof updateFulfillmentTrackingSchema>;

export const cancelFulfillmentSchema = z.object({
  restock: z.boolean().default(true),
});
export type CancelFulfillmentInput = z.infer<typeof cancelFulfillmentSchema>;

export interface FulfillmentLineSummary {
  orderItemId: string;
  title: string;
  sku: string | null;
  quantity: number;
}

export interface FulfillmentSummary {
  id: string;
  status: FulfillmentState;
  location: { id: string; name: string } | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  items: FulfillmentLineSummary[];
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

// ---- returns ----------------------------------------------------------------------------------

export const RETURN_STATUSES = ["requested", "approved", "received", "closed", "declined"] as const;
export const returnStatusSchema = z.enum(RETURN_STATUSES);
export type ReturnStatus = z.infer<typeof returnStatusSchema>;

export const RETURN_RESOLUTIONS = ["refund", "exchange", "store_credit", "none"] as const;
export const returnResolutionSchema = z.enum(RETURN_RESOLUTIONS);
export type ReturnResolution = z.infer<typeof returnResolutionSchema>;

export const returnLineInputSchema = z.object({
  orderItemId: idSchema,
  quantity: z.number().int().min(1),
  condition: z.string().trim().max(200).nullable().optional(),
  restock: z.boolean().default(true),
});
export type ReturnLineInput = z.infer<typeof returnLineInputSchema>;

export const createReturnSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  resolution: returnResolutionSchema.default("refund"),
  note: z.string().trim().max(2000).nullable().optional(),
  items: z.array(returnLineInputSchema).min(1).max(200),
});
export type CreateReturnInput = z.infer<typeof createReturnSchema>;

export const receiveReturnSchema = z.object({
  locationId: idSchema.nullable().optional(),
});
export type ReceiveReturnInput = z.infer<typeof receiveReturnSchema>;

export const closeReturnSchema = z.object({
  createRefund: z.boolean().default(true),
});
export type CloseReturnInput = z.infer<typeof closeReturnSchema>;

export const declineReturnSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
});
export type DeclineReturnInput = z.infer<typeof declineReturnSchema>;

export interface ReturnLineSummary {
  orderItemId: string;
  title: string;
  sku: string | null;
  quantity: number;
  condition: string | null;
  restock: boolean;
}

export interface ReturnSummary {
  id: string;
  status: ReturnStatus;
  reason: string;
  resolution: ReturnResolution;
  note: string | null;
  refundId: string | null;
  items: ReturnLineSummary[];
  receivedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}
