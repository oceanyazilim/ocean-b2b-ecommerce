import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  AnalyticsOverview,
  AnalyticsRangeQuery,
  B2BOverview,
  CountryAnalyticsReport,
  CountrySalesRow,
  CurrencyRevenueRow,
  MarketFilterOption,
  MarketSalesRow,
  OperationsSummary,
  OrderStatusBreakdown,
  RefundPoint,
  RevenueBreakdown,
  RevenuePoint,
  TopCompanyRow,
  TopCustomerRow,
  TopProductRow,
} from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { toMoney } from "../catalog/money";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CountryProfilesService } from "../countries/countries.service";

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// A real, stable geographic fact (ISO 3166-1 EU membership as of this pass) rather than a
// business signal — used only to group the dashboard market filter and country analytics into a
// broader "European Union" bucket (spec sections 53/54). Never used to infer tax obligations.
const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;

// SQL for the market filter (spec section 53): "all"/omitted matches everything, "EU" matches
// the real EU_COUNTRY_CODES list, anything else is treated as a two-letter country code. Always
// resolved against the order's shipping country, falling back to billing when no shipping
// address was collected (same convention as the tax platform-warning check below).
function marketFilterSql(market: string | undefined): Prisma.Sql {
  if (!market || market.toLowerCase() === "all") return Prisma.sql`TRUE`;
  if (market.toUpperCase() === "EU") {
    return Prisma.sql`COALESCE(o.shipping_address->>'countryCode', o.billing_address->>'countryCode') IN (${Prisma.join(EU_COUNTRY_CODES)})`;
  }
  return Prisma.sql`COALESCE(o.shipping_address->>'countryCode', o.billing_address->>'countryCode') = ${market.toUpperCase()}`;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly countries: CountryProfilesService,
  ) {}

  private range(query: AnalyticsRangeQuery): { from: Date; to: Date } {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
    return { from, to };
  }

  private async currency(storeId: string): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  async overview(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<AnalyticsOverview> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const marketSql = marketFilterSql(query.market);

    // Everything below reads through raw SQL (rather than Prisma's typed aggregate/groupBy) so
    // the market filter — a JSON-path condition on shipping/billing address, with a refunds->
    // orders join for the refund queries — applies uniformly. When `query.market` is absent,
    // marketFilterSql() resolves to a bare `TRUE`, so every query below is identical to (and
    // returns the same rows as) the pre-market-filter version of this method.
    const [summaryRows, statusGroups, dayRows, refundAgg, refundDayRows, returningRows] = await Promise.all([
      this.prisma.$queryRaw<{ orders: bigint; revenue: bigint | null; tax: bigint | null }[]>(Prisma.sql`
        SELECT count(*)::bigint AS orders, sum(o.total)::bigint AS revenue, sum(o.tax_total)::bigint AS tax
        FROM orders o
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.status <> 'cancelled' AND o.created_at >= ${from} AND o.created_at <= ${to}
          AND ${marketSql}
      `),
      this.prisma.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
        SELECT o.status::text AS status, count(*)::bigint AS count
        FROM orders o
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.created_at >= ${from} AND o.created_at <= ${to}
          AND ${marketSql}
        GROUP BY 1
      `),
      this.prisma.$queryRaw<{ day: Date; orders: bigint; revenue: bigint | null }[]>(Prisma.sql`
        SELECT date_trunc('day', o.created_at) AS day, count(*)::bigint AS orders, sum(o.total)::bigint AS revenue
        FROM orders o
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.status <> 'cancelled' AND o.created_at >= ${from} AND o.created_at <= ${to}
          AND ${marketSql}
        GROUP BY 1
        ORDER BY 1
      `),
      this.prisma.$queryRaw<{ count: bigint; refunds: bigint | null }[]>(Prisma.sql`
        SELECT count(*)::bigint AS count, sum(r.amount)::bigint AS refunds
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE r.store_id = ${storeId}::uuid AND r.organization_id = ${organizationId}::uuid
          AND r.status = 'succeeded' AND r.created_at >= ${from} AND r.created_at <= ${to}
          AND ${marketSql}
      `),
      this.prisma.$queryRaw<{ day: Date; count: bigint; refunds: bigint | null }[]>(Prisma.sql`
        SELECT date_trunc('day', r.created_at) AS day, count(*)::bigint AS count, sum(r.amount)::bigint AS refunds
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE r.store_id = ${storeId}::uuid AND r.organization_id = ${organizationId}::uuid
          AND r.status = 'succeeded' AND r.created_at >= ${from} AND r.created_at <= ${to}
          AND ${marketSql}
        GROUP BY 1
        ORDER BY 1
      `),
      // Distinct known (non-guest) customers who ordered in range, and how many of those placed
      // more than one order in range — the raw ingredients for a returning-customer rate, and
      // (as `total`) the real "Customers" per-market metric (spec section 53).
      this.prisma.$queryRaw<{ total: bigint; returning: bigint }[]>(Prisma.sql`
        SELECT count(*)::bigint AS total, count(*) FILTER (WHERE orders_in_range > 1)::bigint AS returning
        FROM (
          SELECT o.customer_id, count(*) AS orders_in_range
          FROM orders o
          WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
            AND o.customer_id IS NOT NULL AND o.status <> 'cancelled'
            AND o.created_at >= ${from} AND o.created_at <= ${to}
            AND ${marketSql}
          GROUP BY o.customer_id
        ) c
      `),
    ]);

    const summary = summaryRows[0];
    const orderCount = summary ? Number(summary.orders) : 0;
    const revenueMinor = summary ? Number(summary.revenue ?? 0) : 0;
    const taxMinor = summary ? Number(summary.tax ?? 0) : 0;
    const ordersByStatus: OrderStatusBreakdown[] = statusGroups.map((g) => ({
      status: g.status,
      count: Number(g.count),
    }));
    const revenueByDay: RevenuePoint[] = dayRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      orders: Number(r.orders),
      revenue: toMoney(r.revenue ?? 0n, currency),
    }));
    const refundsMinor = refundAgg[0] ? Number(refundAgg[0].refunds ?? 0) : 0;
    const refundsByDay: RefundPoint[] = refundDayRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      count: Number(r.count),
      refunds: toMoney(r.refunds ?? 0n, currency),
    }));
    const returning = returningRows[0];
    const returningTotal = returning ? Number(returning.total) : 0;
    const returningCustomerRate =
      returningTotal > 0 ? Number(returning!.returning) / returningTotal : null;

    return {
      currency,
      range: { from: from.toISOString(), to: to.toISOString() },
      market: query.market && query.market.toLowerCase() !== "all" ? query.market.toUpperCase() : "all",
      orderCount,
      revenue: toMoney(revenueMinor, currency),
      averageOrderValue: toMoney(orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0, currency),
      revenueByDay,
      ordersByStatus,
      refunds: toMoney(refundsMinor, currency),
      refundsByDay,
      netRevenue: toMoney(revenueMinor - refundsMinor, currency),
      returningCustomerRate,
      customerCount: returningTotal,
      taxCollected: toMoney(taxMinor, currency),
    };
  }

  // Spec section 53: real options for the dashboard's market picker — every country the store
  // has actual (non-cancelled) orders in, plus every country an active Market targets, plus a
  // synthetic "EU" bucket when at least one of those is an EU member.
  async listMarketOptions(ctx: TenantContext): Promise<MarketFilterOption[]> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;

    const [orderRows, activeMarkets] = await Promise.all([
      this.prisma.$queryRaw<{ country_code: string | null; orders: bigint }[]>(Prisma.sql`
        SELECT COALESCE(shipping_address->>'countryCode', billing_address->>'countryCode') AS country_code,
               count(*)::bigint AS orders
        FROM orders
        WHERE store_id = ${storeId}::uuid AND organization_id = ${organizationId}::uuid
          AND status <> 'cancelled' AND (shipping_address IS NOT NULL OR billing_address IS NOT NULL)
        GROUP BY 1
      `),
      this.prisma.market.findMany({
        where: { storeId, organizationId, isActive: true },
        select: { countryCode: true },
      }),
    ]);

    const orderCounts = new Map<string, number>();
    const codes = new Set<string>();
    for (const row of orderRows) {
      if (!row.country_code) continue;
      const code = row.country_code.toUpperCase();
      codes.add(code);
      orderCounts.set(code, Number(row.orders));
    }
    for (const market of activeMarkets) codes.add(market.countryCode.toUpperCase());

    const profiles = await this.countries.getCountryProfiles([...codes]);
    const profileByCode = new Map(profiles.map((p) => [p.countryCode, p]));
    const options: MarketFilterOption[] = [...codes].map((code) => ({
      countryCode: code,
      countryName: profileByCode.get(code)?.name ?? code,
      orderCount: orderCounts.get(code) ?? 0,
    }));
    options.sort((a, b) => a.countryName.localeCompare(b.countryName));

    const euCodes = [...codes].filter((c) => (EU_COUNTRY_CODES as readonly string[]).includes(c));
    if (euCodes.length > 0) {
      options.unshift({
        countryCode: "EU",
        countryName: "European Union",
        orderCount: euCodes.reduce((sum, c) => sum + (orderCounts.get(c) ?? 0), 0),
      });
    }
    return options;
  }

  // Spec section 54: Sales by country, Sales by market, Revenue by currency, Tax collected, B2B
  // revenue, Refunds, Average order value — all from real order/refund data. No map
  // visualization: this store's country set is typically small (a handful of real shipping
  // destinations, not hundreds), so a plain, sortable table is a more honest and more useful
  // breakdown than a low-fidelity SVG world map would be for that few data points.
  async countryReport(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<CountryAnalyticsReport> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);

    const [countryRows, currencyRows, activeMarkets, refundAgg, companyAgg, overallAgg] = await Promise.all([
      this.prisma.$queryRaw<
        { country_code: string | null; orders: bigint; revenue: bigint | null; tax: bigint | null }[]
      >(Prisma.sql`
        SELECT COALESCE(shipping_address->>'countryCode', billing_address->>'countryCode') AS country_code,
               count(*)::bigint AS orders, sum(total)::bigint AS revenue, sum(tax_total)::bigint AS tax
        FROM orders
        WHERE store_id = ${storeId}::uuid AND organization_id = ${organizationId}::uuid
          AND status <> 'cancelled' AND created_at >= ${from} AND created_at <= ${to}
        GROUP BY 1
        ORDER BY revenue DESC NULLS LAST
      `),
      this.prisma.$queryRaw<{ currency: string; orders: bigint; revenue: bigint | null }[]>(Prisma.sql`
        SELECT currency, count(*)::bigint AS orders, sum(total)::bigint AS revenue
        FROM orders
        WHERE store_id = ${storeId}::uuid AND organization_id = ${organizationId}::uuid
          AND status <> 'cancelled' AND created_at >= ${from} AND created_at <= ${to}
        GROUP BY 1
        ORDER BY revenue DESC NULLS LAST
      `),
      this.prisma.market.findMany({
        where: { storeId, organizationId, isActive: true },
        select: { id: true, name: true, countryCode: true },
      }),
      this.prisma.refund.aggregate({
        where: { storeId, organizationId, status: "succeeded", createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.order.aggregate({
        where: {
          storeId,
          organizationId,
          companyId: { not: null },
          status: { not: "cancelled" },
          createdAt: { gte: from, lte: to },
        },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { storeId, organizationId, status: { not: "cancelled" }, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    const countryReportCodes = countryRows
      .map((r) => r.country_code?.toUpperCase())
      .filter((code): code is string => !!code);
    const countryReportProfiles = await this.countries.getCountryProfiles(countryReportCodes);
    const countryReportProfileByCode = new Map(countryReportProfiles.map((p) => [p.countryCode, p]));
    const byCountry: CountrySalesRow[] = countryRows.map((r) => {
      const code = r.country_code?.toUpperCase() ?? null;
      const profile = code ? countryReportProfileByCode.get(code) : null;
      return {
        countryCode: code ?? "unknown",
        countryName: code ? (profile?.name ?? code) : "Unknown",
        orderCount: Number(r.orders),
        revenue: toMoney(r.revenue ?? 0n, currency),
        taxCollected: toMoney(r.tax ?? 0n, currency),
      };
    });

    const byCurrency: CurrencyRevenueRow[] = currencyRows.map((r) => ({
      currency: r.currency,
      orderCount: Number(r.orders),
      revenue: toMoney(r.revenue ?? 0n, r.currency),
    }));

    // Every active Market gets a row (even 0 orders, so the merchant sees markets with no sales
    // yet), plus a trailing "Unassigned" row for real orders whose country matches no active
    // Market.
    const byCountryMap = new Map(countryRows.map((r) => [r.country_code?.toUpperCase() ?? null, r]));
    const assignedCodes = new Set<string>();
    const byMarket: MarketSalesRow[] = activeMarkets.map((market) => {
      const code = market.countryCode.toUpperCase();
      assignedCodes.add(code);
      const row = byCountryMap.get(code);
      return {
        marketId: market.id,
        marketName: market.name,
        countryCode: code,
        orderCount: row ? Number(row.orders) : 0,
        revenue: toMoney(row?.revenue ?? 0n, currency),
      };
    });
    const unassigned = countryRows.filter((r) => {
      const code = r.country_code?.toUpperCase() ?? null;
      return !code || !assignedCodes.has(code);
    });
    if (unassigned.length > 0) {
      byMarket.push({
        marketId: null,
        marketName: "Unassigned",
        countryCode: null,
        orderCount: unassigned.reduce((sum, r) => sum + Number(r.orders), 0),
        revenue: toMoney(
          unassigned.reduce((sum, r) => sum + Number(r.revenue ?? 0n), 0),
          currency,
        ),
      });
    }

    const taxCollectedMinor = countryRows.reduce((sum, r) => sum + Number(r.tax ?? 0n), 0);
    const orderCount = overallAgg._count._all;
    const revenueMinor = Number(overallAgg._sum.total ?? 0);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      byCountry,
      byMarket,
      byCurrency,
      taxCollected: toMoney(taxCollectedMinor, currency),
      b2bRevenue: toMoney(companyAgg._sum.total ?? 0, currency),
      refunds: toMoney(refundAgg._sum.amount ?? 0, currency),
      averageOrderValue: toMoney(orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0, currency),
    };
  }

  async topProducts(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<TopProductRow[]> {
    const storeId = ctx.storeId as string;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const rows = await this.prisma.$queryRaw<
      { product_id: string | null; title: string; sku: string | null; quantity_sold: bigint; revenue: bigint }[]
    >(Prisma.sql`
      SELECT oi.product_id, max(oi.title) AS title, max(oi.sku) AS sku,
             sum(oi.quantity)::bigint AS quantity_sold, sum(oi.line_total)::bigint AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${ctx.organizationId}::uuid
        AND o.status <> 'cancelled' AND o.created_at >= ${from} AND o.created_at <= ${to}
      GROUP BY oi.product_id
      ORDER BY revenue DESC
      LIMIT ${query.limit}
    `);
    return rows.map((r) => ({
      productId: r.product_id,
      title: r.title,
      sku: r.sku,
      quantitySold: Number(r.quantity_sold),
      revenue: toMoney(r.revenue, currency),
    }));
  }

  async topCustomers(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<TopCustomerRow[]> {
    const storeId = ctx.storeId as string;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const rows = await this.prisma.$queryRaw<
      { customer_id: string; name: string; email: string; order_count: bigint; total_spent: bigint }[]
    >(Prisma.sql`
      SELECT o.customer_id,
             max(coalesce(trim(concat(c.first_name, ' ', c.last_name)), c.email)) AS name,
             max(c.email) AS email,
             count(*)::bigint AS order_count, sum(o.total)::bigint AS total_spent
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${ctx.organizationId}::uuid
        AND o.customer_id IS NOT NULL AND o.status <> 'cancelled'
        AND o.created_at >= ${from} AND o.created_at <= ${to}
      GROUP BY o.customer_id
      ORDER BY total_spent DESC
      LIMIT ${query.limit}
    `);
    return rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      email: r.email,
      orderCount: Number(r.order_count),
      totalSpent: toMoney(r.total_spent, currency),
    }));
  }

  // The B2B report: spend grouped by company rather than by individual buyer. Also surfaces each
  // company's real market (the most common shipping/billing country across its orders in range —
  // Postgres's mode() ordered-set aggregate) and its current outstanding invoice balance (spec's
  // Dashboard B2B mode "Top companies" table: Company, Market, Revenue, Orders, Outstanding
  // Balance).
  async topCompanies(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<TopCompanyRow[]> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const rows = await this.prisma.$queryRaw<
      {
        company_id: string;
        name: string;
        order_count: bigint;
        total_spent: bigint;
        market: string | null;
      }[]
    >(Prisma.sql`
      SELECT o.company_id, max(co.display_name) AS name,
             count(*)::bigint AS order_count, sum(o.total)::bigint AS total_spent,
             mode() WITHIN GROUP (
               ORDER BY COALESCE(o.shipping_address->>'countryCode', o.billing_address->>'countryCode')
             ) AS market
      FROM orders o
      JOIN companies co ON co.id = o.company_id
      WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
        AND o.company_id IS NOT NULL AND o.status <> 'cancelled'
        AND o.created_at >= ${from} AND o.created_at <= ${to}
      GROUP BY o.company_id
      ORDER BY total_spent DESC
      LIMIT ${query.limit}
    `);
    if (rows.length === 0) return [];

    const companyIds = rows.map((r) => r.company_id);
    const [balances, marketCodes] = await Promise.all([
      this.prisma.$queryRaw<{ company_id: string; outstanding: bigint | null }[]>(Prisma.sql`
        SELECT company_id, sum(amount - paid_amount)::bigint AS outstanding
        FROM invoices
        WHERE store_id = ${storeId}::uuid AND organization_id = ${organizationId}::uuid
          AND status NOT IN ('paid', 'cancelled') AND company_id = ANY(${companyIds}::uuid[])
        GROUP BY company_id
      `),
      this.countries.getCountryProfiles(
        rows.map((r) => r.market?.toUpperCase()).filter((c): c is string => !!c),
      ),
    ]);
    const balanceByCompany = new Map(balances.map((b) => [b.company_id, Number(b.outstanding ?? 0)]));
    const profileByCode = new Map(marketCodes.map((p) => [p.countryCode, p]));

    return rows.map((r) => {
      const code = r.market?.toUpperCase() ?? null;
      return {
        companyId: r.company_id,
        name: r.name,
        orderCount: Number(r.order_count),
        totalSpent: toMoney(r.total_spent, currency),
        market: code ? { countryCode: code, countryName: profileByCode.get(code)?.name ?? code } : null,
        outstandingBalance: toMoney(balanceByCompany.get(r.company_id) ?? 0, currency),
      };
    });
  }

  // Dashboard "Revenue Breakdown": a real, stepped financial summary computed from Order/
  // OrderItem/Refund/ProductVariant — see RevenueBreakdown's doc comment for exactly what each
  // figure is and why taxes never enter netRevenue.
  async revenueBreakdown(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<RevenueBreakdown> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const marketSql = marketFilterSql(query.market);

    const [totalsRows, refundRows, cogsRows] = await Promise.all([
      this.prisma.$queryRaw<
        { gross: bigint | null; discounts: bigint | null; shipping: bigint | null; tax: bigint | null }[]
      >(Prisma.sql`
        SELECT sum(o.subtotal)::bigint AS gross, sum(o.discount_total)::bigint AS discounts,
               sum(o.shipping_total)::bigint AS shipping, sum(o.tax_total)::bigint AS tax
        FROM orders o
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.status <> 'cancelled' AND o.created_at >= ${from} AND o.created_at <= ${to}
          AND ${marketSql}
      `),
      this.prisma.$queryRaw<{ refunds: bigint | null }[]>(Prisma.sql`
        SELECT sum(r.amount)::bigint AS refunds
        FROM refunds r
        JOIN orders o ON o.id = r.order_id
        WHERE r.store_id = ${storeId}::uuid AND r.organization_id = ${organizationId}::uuid
          AND r.status = 'succeeded' AND r.created_at >= ${from} AND r.created_at <= ${to}
          AND ${marketSql}
      `),
      this.prisma.$queryRaw<{ cogs: bigint | null; with_cost: bigint; missing_cost: bigint }[]>(Prisma.sql`
        SELECT sum(oi.quantity * pv.cost)::bigint AS cogs,
               count(*) FILTER (WHERE pv.cost IS NOT NULL)::bigint AS with_cost,
               count(*) FILTER (WHERE pv.cost IS NULL)::bigint AS missing_cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.status <> 'cancelled' AND o.created_at >= ${from} AND o.created_at <= ${to}
          AND ${marketSql}
      `),
    ]);

    const totals = totalsRows[0];
    const grossMinor = Number(totals?.gross ?? 0);
    const discountsMinor = Number(totals?.discounts ?? 0);
    const shippingMinor = Number(totals?.shipping ?? 0);
    const taxMinor = Number(totals?.tax ?? 0);
    const refundsMinor = Number(refundRows[0]?.refunds ?? 0);
    const netMinor = grossMinor - discountsMinor - refundsMinor + shippingMinor;

    const cogs = cogsRows[0];
    const itemsWithCost = Number(cogs?.with_cost ?? 0);
    const itemsMissingCost = Number(cogs?.missing_cost ?? 0);
    const cogsMinor = Number(cogs?.cogs ?? 0);

    return {
      currency,
      range: { from: from.toISOString(), to: to.toISOString() },
      grossSales: toMoney(grossMinor, currency),
      discounts: toMoney(discountsMinor, currency),
      refunds: toMoney(refundsMinor, currency),
      shippingRevenue: toMoney(shippingMinor, currency),
      taxCollected: toMoney(taxMinor, currency),
      netRevenue: toMoney(netMinor, currency),
      costOfGoodsSold: toMoney(cogsMinor, currency),
      itemsWithCost,
      itemsMissingCost,
      estimatedGrossProfit: itemsWithCost > 0 ? toMoney(netMinor - cogsMinor, currency) : null,
    };
  }

  // Dashboard "Operations" mode: real, currently-open action queues with genuine per-row deep
  // links (an order or company page — this codebase has no global returns/failed-payments list
  // page to link a filtered view to, so each row links to where the action actually happens).
  async operationsSummary(ctx: TenantContext): Promise<OperationsSummary> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const recentSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ITEM_LIMIT = 5;

    const [returnRows, returnCount, paymentRows, paymentCount, invoiceRows, invoiceByCurrency, invoiceCount] =
      await Promise.all([
        this.prisma.return.findMany({
          where: { storeId, organizationId, status: { in: ["requested", "approved"] } },
          include: { order: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
          take: ITEM_LIMIT,
        }),
        this.prisma.return.count({
          where: { storeId, organizationId, status: { in: ["requested", "approved"] } },
        }),
        this.prisma.payment.findMany({
          where: { storeId, organizationId, status: "failed", createdAt: { gte: recentSince } },
          include: { order: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: ITEM_LIMIT,
        }),
        this.prisma.payment.count({
          where: { storeId, organizationId, status: "failed", createdAt: { gte: recentSince } },
        }),
        this.prisma.invoice.findMany({
          where: { storeId, organizationId, status: "pending", dueAt: { lt: new Date() } },
          include: { order: { select: { id: true, name: true, currency: true } }, company: { select: { displayName: true } } },
          orderBy: { dueAt: "asc" },
          take: ITEM_LIMIT,
        }),
        this.prisma.$queryRaw<{ currency: string; count: bigint; outstanding: bigint | null }[]>(Prisma.sql`
          SELECT o.currency, count(*)::bigint AS count, sum(i.amount - i.paid_amount)::bigint AS outstanding
          FROM invoices i
          JOIN orders o ON o.id = i.order_id
          WHERE i.store_id = ${storeId}::uuid AND i.organization_id = ${organizationId}::uuid
            AND i.status = 'pending' AND i.due_at < now()
          GROUP BY 1
        `),
        this.prisma.invoice.count({
          where: { storeId, organizationId, status: "pending", dueAt: { lt: new Date() } },
        }),
      ]);

    return {
      returns: {
        count: returnCount,
        items: returnRows.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          orderName: r.order.name,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      failedPayments: {
        count: paymentCount,
        items: paymentRows.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          orderName: p.order.name,
          amount: toMoney(p.amount, p.currency),
          provider: p.provider,
          failureReason: p.failureReason,
          createdAt: p.createdAt.toISOString(),
        })),
      },
      overdueInvoices: {
        count: invoiceCount,
        totalOutstandingByCurrency: invoiceByCurrency.map((r) => ({
          currency: r.currency,
          amount: toMoney(r.outstanding ?? 0n, r.currency),
        })),
        items: invoiceRows.map((i) => ({
          id: i.id,
          orderId: i.orderId,
          companyId: i.companyId,
          companyName: i.company.displayName,
          number: i.number,
          balance: toMoney(i.amount - i.paidAmount, i.order.currency),
          dueAt: i.dueAt.toISOString(),
        })),
      },
    };
  }

  // Dashboard "B2B" mode: assembles real figures already computed elsewhere in this codebase
  // (this module's own B2B revenue query, Companies/Quotes stats, the Invoices and Credit
  // modules) into one summary call.
  async b2bOverview(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<B2BOverview> {
    const storeId = ctx.storeId as string;
    const organizationId = ctx.organizationId;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const marketSql = marketFilterSql(query.market);

    const [revenueRows, activeCompanies, openQuotes, invoiceByCurrency, creditByCurrency] = await Promise.all([
      this.prisma.$queryRaw<{ orders: bigint; revenue: bigint | null }[]>(Prisma.sql`
        SELECT count(*)::bigint AS orders, sum(o.total)::bigint AS revenue
        FROM orders o
        WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${organizationId}::uuid
          AND o.company_id IS NOT NULL AND o.status <> 'cancelled'
          AND o.created_at >= ${from} AND o.created_at <= ${to} AND ${marketSql}
      `),
      this.prisma.company.count({ where: { storeId, organizationId, status: "active" } }),
      this.prisma.quote.count({ where: { storeId, organizationId, status: "sent" } }),
      this.prisma.$queryRaw<{ currency: string; outstanding: bigint | null }[]>(Prisma.sql`
        SELECT o.currency, sum(i.amount - i.paid_amount)::bigint AS outstanding
        FROM invoices i
        JOIN orders o ON o.id = i.order_id
        WHERE i.store_id = ${storeId}::uuid AND i.organization_id = ${organizationId}::uuid
          AND i.status NOT IN ('paid', 'cancelled')
        GROUP BY 1
      `),
      this.prisma.creditAccount.groupBy({
        by: ["currency"],
        where: { OR: [{ company: { storeId } }, { companyLocation: { storeId } }] },
        _sum: { limit: true, used: true },
      }),
    ]);

    const revenue = revenueRows[0];
    const orderCount = revenue ? Number(revenue.orders) : 0;
    const revenueMinor = revenue ? Number(revenue.revenue ?? 0) : 0;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      revenue: toMoney(revenueMinor, currency),
      orderCount,
      averageOrderValue: toMoney(orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0, currency),
      activeCompanies,
      openQuotes,
      outstandingInvoicesByCurrency: invoiceByCurrency.map((r) => ({
        currency: r.currency,
        amount: toMoney(r.outstanding ?? 0n, r.currency),
      })),
      creditByCurrency: creditByCurrency.map((c) => {
        const limit = Number(c._sum.limit ?? 0);
        const used = Number(c._sum.used ?? 0);
        return {
          currency: c.currency,
          limit: toMoney(limit, c.currency),
          used: toMoney(used, c.currency),
          available: toMoney(Math.max(0, limit - used), c.currency),
        };
      }),
    };
  }

  async topCompaniesCsv(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<string> {
    const rows = await this.topCompanies(ctx, { ...query, limit: 50 });
    const header = "Company,Orders,Total spent,Currency";
    const lines = rows.map(
      (r) => `${csvField(r.name)},${r.orderCount},${(r.totalSpent.amount / 100).toFixed(2)},${r.totalSpent.currency}`,
    );
    return [header, ...lines].join("\n");
  }
}

function csvField(value: string): string {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @ (or tab/CR) makes Excel/
  // Sheets treat the cell as a formula when the exported file is opened, not as plain text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
