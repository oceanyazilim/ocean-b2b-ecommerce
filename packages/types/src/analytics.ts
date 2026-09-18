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
