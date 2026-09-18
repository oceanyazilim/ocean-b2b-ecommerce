import { Injectable } from "@nestjs/common";
import type { Entitlement, Plan } from "@ocean/db";
import type { PlanPrices, PlanSummary } from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

export function toPlanSummary(plan: Plan & { entitlements: Entitlement[] }): PlanSummary {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    prices: plan.prices as PlanPrices | null,
    status: plan.status,
    entitlements: Object.fromEntries(plan.entitlements.map((e) => [e.key, e.value])),
  };
}

// Plans are a platform-owned catalog (no tenant column, same pattern as Theme) — seeded via
// packages/db/prisma/seed.ts rather than exposed through a write API, since there's no
// platform-operator role in this codebase distinct from organization roles.
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listCatalog(): Promise<PlanSummary[]> {
    const plans = await this.prisma.plan.findMany({
      where: { status: "active" },
      orderBy: { sortOrder: "asc" },
      include: { entitlements: true },
    });
    return plans.map(toPlanSummary);
  }
}
