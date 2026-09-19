import { Injectable } from "@nestjs/common";
import type { PlatformMetrics, PlatformPlanBreakdown } from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// Simple aggregate counts, not an analytics engine (per the task brief) — a handful of `count`/
// `groupBy` queries, refreshed on every request. Fine at this scale; revisit with a materialized
// view or scheduled rollup if the platform-admin dashboard ever needs to load faster than a live
// count query allows.
@Injectable()
export class PlatformMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<PlatformMetrics> {
    const [
      organizationCount,
      storeCount,
      activeSubscriptionCount,
      trialingSubscriptionCount,
      pastDueSubscriptionCount,
      canceledSubscriptionCount,
      planGroups,
      verifiedDomainCount,
      pendingDomainCount,
      failedDomainCount,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.store.count(),
      this.prisma.subscription.count({ where: { status: "active" } }),
      this.prisma.subscription.count({ where: { status: "trialing" } }),
      this.prisma.subscription.count({ where: { status: "past_due" } }),
      this.prisma.subscription.count({ where: { status: "canceled" } }),
      this.prisma.subscription.groupBy({ by: ["planId"], _count: { _all: true } }),
      this.prisma.domain.count({ where: { status: "verified" } }),
      this.prisma.domain.count({ where: { status: "pending" } }),
      this.prisma.domain.count({ where: { status: "failed" } }),
    ]);

    const plans = planGroups.length
      ? await this.prisma.plan.findMany({
          where: { id: { in: planGroups.map((g) => g.planId) } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const planById = new Map(plans.map((p) => [p.id, p]));
    const subscriptionsByPlan: PlatformPlanBreakdown[] = planGroups
      .map((g) => {
        const plan = planById.get(g.planId);
        return plan
          ? { planId: plan.id, planCode: plan.code, planName: plan.name, count: g._count._all }
          : null;
      })
      .filter((v): v is PlatformPlanBreakdown => v !== null)
      .sort((a, b) => b.count - a.count);

    return {
      organizationCount,
      storeCount,
      activeSubscriptionCount,
      trialingSubscriptionCount,
      pastDueSubscriptionCount,
      canceledSubscriptionCount,
      subscriptionsByPlan,
      verifiedDomainCount,
      pendingDomainCount,
      failedDomainCount,
    };
  }
}
