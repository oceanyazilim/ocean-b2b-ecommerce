import { z } from "zod";

import type { Money } from "./primitives";

export const analyticsRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export interface RevenuePoint {
  date: string;
  orders: number;
  revenue: Money;
}

export interface RefundPoint {
  date: string;
  count: number;
  refunds: Money;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
}

export interface AnalyticsOverview {
  currency: string;
  range: { from: string; to: string };
  orderCount: number;
  revenue: Money;
  averageOrderValue: Money;
  revenueByDay: RevenuePoint[];
  ordersByStatus: OrderStatusBreakdown[];
  // Refunds actually settled ("succeeded") within the range — not merely requested.
  refunds: Money;
  refundsByDay: RefundPoint[];
  // revenue - refunds, both already scoped to the same range.
  netRevenue: Money;
  // Share of distinct known (non-guest) customers who ordered in the range that placed more than
  // one order in the range. Null when nobody with a known customerId ordered in the range at all
  // (0/0 is undefined, not 0%).
  returningCustomerRate: number | null;
}

export interface TopProductRow {
  productId: string | null;
  title: string;
  sku: string | null;
  quantitySold: number;
  revenue: Money;
}

export interface TopCustomerRow {
  customerId: string;
  name: string;
  email: string;
  orderCount: number;
  totalSpent: Money;
}

export interface TopCompanyRow {
  companyId: string;
  name: string;
  orderCount: number;
  totalSpent: Money;
}
