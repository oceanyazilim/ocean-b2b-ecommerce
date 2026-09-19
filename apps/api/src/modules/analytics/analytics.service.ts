import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  AnalyticsOverview,
  AnalyticsRangeQuery,
  OrderStatusBreakdown,
  RevenuePoint,
  TopCompanyRow,
  TopCustomerRow,
  TopProductRow,
} from "@ocean/types";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { toMoney } from "../catalog/money";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const scope = { storeId, organizationId: ctx.organizationId };

    const [agg, statusGroups, dayRows] = await Promise.all([
      this.prisma.order.aggregate({
        where: { ...scope, status: { not: "cancelled" }, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { ...scope, createdAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ day: Date; orders: bigint; revenue: bigint | null }[]>(Prisma.sql`
        SELECT date_trunc('day', created_at) AS day, count(*)::bigint AS orders, sum(total)::bigint AS revenue
        FROM orders
        WHERE store_id = ${storeId}::uuid AND organization_id = ${ctx.organizationId}::uuid
          AND status <> 'cancelled' AND created_at >= ${from} AND created_at <= ${to}
        GROUP BY 1
        ORDER BY 1
      `),
    ]);

    const orderCount = agg._count._all;
    const revenueMinor = Number(agg._sum.total ?? 0);
    const ordersByStatus: OrderStatusBreakdown[] = statusGroups.map((g) => ({
      status: g.status,
      count: g._count._all,
    }));
    const revenueByDay: RevenuePoint[] = dayRows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      orders: Number(r.orders),
      revenue: toMoney(r.revenue ?? 0n, currency),
    }));

    return {
      currency,
      range: { from: from.toISOString(), to: to.toISOString() },
      orderCount,
      revenue: toMoney(revenueMinor, currency),
      averageOrderValue: toMoney(orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0, currency),
      revenueByDay,
      ordersByStatus,
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

  // The B2B report: spend grouped by company rather than by individual buyer.
  async topCompanies(ctx: TenantContext, query: AnalyticsRangeQuery): Promise<TopCompanyRow[]> {
    const storeId = ctx.storeId as string;
    const { from, to } = this.range(query);
    const currency = await this.currency(storeId);
    const rows = await this.prisma.$queryRaw<
      { company_id: string; name: string; order_count: bigint; total_spent: bigint }[]
    >(Prisma.sql`
      SELECT o.company_id, max(co.display_name) AS name,
             count(*)::bigint AS order_count, sum(o.total)::bigint AS total_spent
      FROM orders o
      JOIN companies co ON co.id = o.company_id
      WHERE o.store_id = ${storeId}::uuid AND o.organization_id = ${ctx.organizationId}::uuid
        AND o.company_id IS NOT NULL AND o.status <> 'cancelled'
        AND o.created_at >= ${from} AND o.created_at <= ${to}
      GROUP BY o.company_id
      ORDER BY total_spent DESC
      LIMIT ${query.limit}
    `);
    return rows.map((r) => ({
      companyId: r.company_id,
      name: r.name,
      orderCount: Number(r.order_count),
      totalSpent: toMoney(r.total_spent, currency),
    }));
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
