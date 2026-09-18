import { z } from "zod";

import { addressSchema, type Address } from "./addresses";
import { cursorPaginationQuerySchema } from "./api";
import { emailSchema, idSchema, moneyMinorSchema, type Money } from "./primitives";
import type { EligibleShippingRate } from "./shipping";
import type { PaymentMethodSummary, PaymentSummary, RefundSummary } from "./payments";
import type { FulfillmentSummary, ReturnSummary } from "./fulfillments";
import type { PriceSource, QuantityRuleCheck, VolumeTier } from "./pricing";

// ---- shared ------------------------------------------------------------------------------------

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(50);
const quantitySchema = z.number().int().min(1).max(1_000_000);

export const buyerInputSchema = z.object({
  customerId: idSchema.nullable().optional(),
  companyId: idSchema.nullable().optional(),
  companyLocationId: idSchema.nullable().optional(),
});
export type BuyerInput = z.infer<typeof buyerInputSchema>;

export const PRICE_SOURCE_KINDS = ["contract", "price_list", "volume", "base", "custom"] as const;
export type PriceSourceKind = (typeof PRICE_SOURCE_KINDS)[number];

export interface BuyerSummary {
  customer: { id: string; email: string; displayName: string } | null;
  company: { id: string; displayName: string } | null;
  location: { id: string; name: string } | null;
}

// A priced line as carts, draft orders and checkout previews show it.
export interface QuotedLine {
  variantId: string;
  productId: string | null;
  title: string;
  variantTitle: string;
  sku: string | null;
  image: { url: string; alt: string | null } | null;
  quantity: number;
  unitPrice: Money;
  basePrice: Money;
  compareAtPrice: Money | null;
  lineTotal: Money;
  priceSource: PriceSourceKind;
  visible: boolean;
  available: number | null;
  tiers: { minQuantity: number; unitPrice: Money }[];
  quantityRule: QuantityRuleCheck;
  problems: string[];
}

export interface OrderTotals {
  subtotal: Money;
  discountTotal: Money;
  shippingTotal: Money;
  taxTotal: Money;
  total: Money;
  itemCount: number;
}

// ---- carts -------------------------------------------------------------------------------------

export const CART_STATUSES = ["active", "completed", "abandoned"] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

export const cartLineInputSchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema,
  properties: z.record(z.string(), z.string().max(500)).optional(),
});

export const createCartSchema = z.object({
  buyer: buyerInputSchema.default({}),
  email: emailSchema.nullable().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  poNumber: optionalText(80),
  note: optionalText(2000),
  items: z.array(cartLineInputSchema).max(200).default([]),
});
export type CreateCartInput = z.infer<typeof createCartSchema>;

export const updateCartSchema = z
  .object({
    buyer: buyerInputSchema.optional(),
    email: emailSchema.nullable().optional(),
    poNumber: optionalText(80),
    note: optionalText(2000),
    shippingAddress: addressSchema.nullable().optional(),
    billingAddress: addressSchema.nullable().optional(),
    shippingRateId: idSchema.nullable().optional(),
    paymentMethodId: idSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateCartInput = z.infer<typeof updateCartSchema>;

export const addCartItemSchema = cartLineInputSchema;
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({ quantity: quantitySchema });
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const checkoutSchema = z.object({
  email: emailSchema.nullable().optional(),
  shippingAddress: addressSchema.nullable().optional(),
  billingAddress: addressSchema.nullable().optional(),
  poNumber: optionalText(80),
  note: optionalText(2000),
  shippingRateId: idSchema.nullable().optional(),
  paymentMethodId: idSchema.nullable().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CartDetail {
  id: string;
  status: CartStatus;
  buyer: BuyerSummary;
  catalogRestricted: boolean;
  email: string | null;
  currency: string;
  poNumber: string | null;
  note: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  items: (QuotedLine & { id: string; properties: Record<string, string> | null })[];
  totals: OrderTotals;
  shippingRate: EligibleShippingRate | null;
  availableShippingRates: EligibleShippingRate[];
  paymentMethod: PaymentMethodSummary | null;
  ready: boolean;
  problems: string[];
  completedOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- orders ------------------------------------------------------------------------------------

export const ORDER_STATUSES = [
  "pending_approval",
  "confirmed",
  "processing",
  "completed",
  "cancelled",
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "paid",
  "partially_paid",
  "partially_refunded",
  "refunded",
  "voided",
] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const FULFILLMENT_STATUSES = ["unfulfilled", "partially_fulfilled", "fulfilled"] as const;
export const fulfillmentStatusSchema = z.enum(FULFILLMENT_STATUSES);
export type FulfillmentStatus = z.infer<typeof fulfillmentStatusSchema>;

export const ORDER_SOURCES = ["storefront", "draft_order", "admin", "api"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SORTS = ["created_desc", "created_asc", "total_desc", "number_desc"] as const;

export const orderListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: orderStatusSchema.optional(),
  open: z.coerce.boolean().optional(),
  paymentStatus: paymentStatusSchema.optional(),
  fulfillmentStatus: fulfillmentStatusSchema.optional(),
  customerId: idSchema.optional(),
  companyId: idSchema.optional(),
  sort: z.enum(ORDER_SORTS).default("created_desc"),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const updateOrderSchema = z
  .object({
    note: optionalText(2000),
    tags: tagsSchema.optional(),
    poNumber: optionalText(80),
    email: emailSchema.nullable().optional(),
    shippingAddress: addressSchema.nullable().optional(),
    billingAddress: addressSchema.nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update");
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(500),
  restock: z.boolean().default(true),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const orderNoteSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;

export interface OrderItemSummary {
  id: string;
  variantId: string | null;
  productId: string | null;
  title: string;
  variantTitle: string;
  sku: string | null;
  image: { url: string; alt: string | null } | null;
  quantity: number;
  unitPrice: Money;
  compareAtPrice: Money | null;
  priceSource: PriceSourceKind;
  discount: Money;
  tax: Money;
  lineTotal: Money;
  requiresShipping: boolean;
  fulfilledQuantity: number;
  refundedQuantity: number;
  reservations: { locationId: string; locationName: string; quantity: number }[];
}

export interface OrderEventEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actor: { id: string; name: string } | null;
  actorType: string;
  createdAt: string;
}

export interface OrderSummary {
  id: string;
  number: number;
  name: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  source: OrderSource;
  buyer: BuyerSummary;
  email: string | null;
  currency: string;
  poNumber: string | null;
  tags: string[];
  itemCount: number;
  total: Money;
  createdAt: string;
  updatedAt: string;
}

export interface OrderDetail extends OrderSummary {
  note: string | null;
  totals: OrderTotals;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  items: OrderItemSummary[];
  events: OrderEventEntry[];
  payments: PaymentSummary[];
  refunds: RefundSummary[];
  fulfillments: FulfillmentSummary[];
  returns: ReturnSummary[];
  placedBy: { id: string; name: string } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  draftOrderId: string | null;
  version: number;
}

export interface OrderStats {
  currency: string;
  openOrders: number;
  awaitingPayment: number;
  toFulfill: number;
  ordersLast30Days: number;
  grossSalesLast30Days: Money;
  averageOrderValueLast30Days: Money;
}

// ---- draft orders ------------------------------------------------------------------------------

export const DRAFT_ORDER_STATUSES = ["open", "completed", "cancelled"] as const;
export type DraftOrderStatus = (typeof DRAFT_ORDER_STATUSES)[number];

// A custom unit price is a deliberate merchant override; blank = quote from PricingService.
export const draftLineInputSchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema,
  customUnitPrice: moneyMinorSchema.min(0).nullable().optional(),
});
export type DraftLineInput = z.infer<typeof draftLineInputSchema>;

const draftFields = z.object({
  buyer: buyerInputSchema,
  email: emailSchema.nullable().optional(),
  poNumber: optionalText(80),
  note: optionalText(2000),
  tags: tagsSchema,
  shippingAddress: addressSchema.nullable().optional(),
  billingAddress: addressSchema.nullable().optional(),
  shippingRateId: idSchema.nullable().optional(),
  items: z.array(draftLineInputSchema).max(200),
});

export const createDraftOrderSchema = draftFields.extend({
  buyer: buyerInputSchema.default({}),
  tags: tagsSchema.default([]),
  items: z.array(draftLineInputSchema).max(200).default([]),
});
export type CreateDraftOrderInput = z.infer<typeof createDraftOrderSchema>;

export const updateDraftOrderSchema = draftFields
  .partial()
  .extend({ version: z.number().int().positive() });
export type UpdateDraftOrderInput = z.infer<typeof updateDraftOrderSchema>;

export const draftOrderListQuerySchema = cursorPaginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(DRAFT_ORDER_STATUSES).optional(),
});
export type DraftOrderListQuery = z.infer<typeof draftOrderListQuerySchema>;

export interface DraftOrderSummary {
  id: string;
  number: number;
  name: string;
  status: DraftOrderStatus;
  buyer: BuyerSummary;
  email: string | null;
  currency: string;
  poNumber: string | null;
  tags: string[];
  itemCount: number;
  total: Money;
  completedOrderId: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface DraftOrderDetail extends DraftOrderSummary {
  note: string | null;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  items: (QuotedLine & { id: string; customUnitPrice: Money | null })[];
  totals: OrderTotals;
  shippingRate: EligibleShippingRate | null;
  availableShippingRates: EligibleShippingRate[];
  catalogRestricted: boolean;
  ready: boolean;
  problems: string[];
  version: number;
}

export type { VolumeTier, PriceSource };
