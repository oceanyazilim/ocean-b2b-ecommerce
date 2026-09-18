import { Injectable } from "@nestjs/common";

import { ForbiddenError } from "../../common/errors/domain-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SubscriptionsService } from "./subscriptions.service";

// The one thing every other module needs from billing: "is this organization allowed to do
// one more of X". Exported for cross-module use (StoresService, and future staff-invite flows)
// without them needing to know anything about plans/subscriptions themselves.
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async resolve(organizationId: string): Promise<Record<string, unknown>> {
    const sub = await this.subscriptions.getOrCreateForOrganization(organizationId);
    const entitlements = await this.prisma.entitlement.findMany({ where: { planId: sub.planId } });
    return Object.fromEntries(entitlements.map((e) => [e.key, e.value]));
  }

  // Throws ForbiddenError if creating one more of `key` (given current usage) would exceed the
  // organization's plan. A non-numeric or missing entitlement value is treated as unlimited.
  async assertWithinLimit(organizationId: string, key: string, currentUsage: number): Promise<void> {
    const bag = await this.resolve(organizationId);
    const limit = bag[key];
    if (typeof limit === "number" && currentUsage >= limit) {
      throw new ForbiddenError(
        `Your plan allows up to ${limit} for "${key}". Upgrade your plan to increase this limit.`,
      );
    }
  }
}
