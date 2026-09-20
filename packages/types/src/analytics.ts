import { z } from "zod";

import type { Money } from "./primitives";

export const analyticsRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  // Spec section 53's dashboard market filter: "all" (default/omitted), a two-letter ISO country
  // code the store actually sells into, or the "EU" grouping (a real, stable geographic fact —
  // EU membership — not a fake business signal). Scopes overview() to orders whose shipping (or
  // billing, when no shipping address) country matches.
  market: z.string().trim().max(8).optional(),
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
  // Echoes the market filter this overview was scoped to (spec section 53) — "all" when none.
  market: string;
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
  // Distinct known (non-guest) customers who ordered in the range — spec section 53's "Customers"
  // per-market metric.
  customerCount: number;
  // Sum of Order.taxTotal (L3's real tax calculation, already stored on each order) for
  // non-cancelled orders in range — spec section 53's "Tax collected" per-market metric.
  taxCollected: Money;
}

// Spec section 53: one filterable option in the dashboard's market picker, built only from real
// data — a country the store has actual orders in and/or an active Market for, plus a synthetic
// "EU" grouping (a stable geographic fact) shown only when at least one such country is an EU
// member.
export interface MarketFilterOption {
  countryCode: string;
  countryName: string;
  orderCount: number;
}

// ---------------------------------------------------------------------------
// L6: Country analytics (spec section 54)
// ---------------------------------------------------------------------------

export interface CountrySalesRow {
  countryCode: string;
  countryName: string;
  orderCount: number;
  revenue: Money;
  taxCollected: Money;
}

// One row per active Market, plus a trailing "Unassigned" row (marketId null) for real orders
// whose shipping/billing country doesn't match any active Market's country.
export interface MarketSalesRow {
  marketId: string | null;
  marketName: string;
  countryCode: string | null;
  orderCount: number;
  revenue: Money;
}

export interface CurrencyRevenueRow {
  currency: string;
  orderCount: number;
  revenue: Money;
}

export interface CountryAnalyticsReport {
  range: { from: string; to: string };
  byCountry: CountrySalesRow[];
  byMarket: MarketSalesRow[];
  byCurrency: CurrencyRevenueRow[];
  // Sums below are raw amounts across whatever currencies orders were placed in, labeled with the
  // store's default currency — the same simplification AnalyticsOverview already makes; this
  // system doesn't currency-convert historical orders.
  taxCollected: Money;
  b2bRevenue: Money;
  refunds: Money;
  averageOrderValue: Money;
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
