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
  // Spec's Dashboard B2B mode "Top companies" table (Company, Market, Revenue, Orders,
  // Outstanding Balance): market is the most common real shipping/billing country across this
  // company's orders in range (null when no orders had an address on file), and outstandingBalance
  // is the real sum of (Invoice.amount - Invoice.paidAmount) for that company's non-paid,
  // non-cancelled invoices — not scoped to the report's date range, since a balance is a
  // point-in-time fact, not a period total.
  market: { countryCode: string; countryName: string } | null;
  outstandingBalance: Money;
}

// ---------------------------------------------------------------------------
// Dashboard "Revenue Breakdown" (separate from the simple revenue chart): a real, stepped
// financial summary. Taxes are shown for reference only and are never folded into netRevenue —
// "Do not treat taxes as revenue." Payment provider fees are omitted entirely: this codebase has
// no live PSP integration and no real fee data to report (see Finance dashboard mode).
// ---------------------------------------------------------------------------
export interface RevenueBreakdown {
  currency: string;
  range: { from: string; to: string };
  // Sum of Order.subtotal (item revenue before order-level discounts, shipping and tax) for
  // non-cancelled orders in range.
  grossSales: Money;
  // Sum of Order.discountTotal.
  discounts: Money;
  // Sum of settled (status = succeeded) Refund.amount in range.
  refunds: Money;
  // Sum of Order.shippingTotal — real shipping revenue collected from buyers.
  shippingRevenue: Money;
  // Sum of Order.taxTotal — shown for reference only, excluded from netRevenue below.
  taxCollected: Money;
  // grossSales - discounts - refunds + shippingRevenue. Deliberately excludes taxCollected.
  netRevenue: Money;
  // Real COGS: sum(OrderItem.quantity * ProductVariant.cost) for items whose variant still has a
  // cost set. Only ever an estimate against current cost, not a historical snapshot (Order/
  // OrderItem don't snapshot cost at sale time) — see itemsMissingCost for coverage.
  costOfGoodsSold: Money;
  itemsWithCost: number;
  itemsMissingCost: number;
  // netRevenue - costOfGoodsSold. Null (not zero, not faked) when not a single sold item in range
  // has a variant cost on file — there is then no real basis for a profit estimate at all.
  estimatedGrossProfit: Money | null;
}

// ---------------------------------------------------------------------------
// Dashboard "Operations" mode: real, currently-open action items, each with a genuine deep link.
// Not date-ranged (these are current-state queues, like the existing needs-attention stats), with
// one exception (failedPayments) which is capped to a recent window so a payment that failed once
// long ago and was never retried doesn't sit in the action queue forever.
// ---------------------------------------------------------------------------
export interface OperationsReturnItem {
  id: string;
  orderId: string;
  orderName: string;
  status: string;
  reason: string;
  createdAt: string;
}

export interface OperationsFailedPaymentItem {
  id: string;
  orderId: string;
  orderName: string;
  amount: Money;
  provider: string;
  failureReason: string | null;
  createdAt: string;
}

export interface OperationsOverdueInvoiceItem {
  id: string;
  orderId: string;
  companyId: string;
  companyName: string;
  number: string;
  balance: Money;
  dueAt: string;
}

export interface OperationsSummary {
  returns: { count: number; items: OperationsReturnItem[] };
  failedPayments: { count: number; items: OperationsFailedPaymentItem[] };
  overdueInvoices: {
    count: number;
    totalOutstandingByCurrency: { currency: string; amount: Money }[];
    items: OperationsOverdueInvoiceItem[];
  };
}

// ---------------------------------------------------------------------------
// Dashboard "B2B" mode: real figures already computed elsewhere in this codebase (Phase 13's B2B
// report, the Credit module, the Invoices/Finance module), assembled into one summary so the mode
// doesn't need N separate round trips.
// ---------------------------------------------------------------------------
export interface B2BOverview {
  range: { from: string; to: string };
  revenue: Money;
  orderCount: number;
  averageOrderValue: Money;
  activeCompanies: number;
  openQuotes: number;
  // Sum of (Invoice.amount - Invoice.paidAmount) across all non-paid, non-cancelled invoices,
  // grouped by currency — not scoped to the report's date range (a balance is point-in-time).
  outstandingInvoicesByCurrency: { currency: string; amount: Money }[];
  // Real per-currency roll-up of every CreditAccount this store's companies/locations have.
  // Empty array (not faked) when the store has no credit accounts at all.
  creditByCurrency: { currency: string; limit: Money; used: Money; available: Money }[];
}
