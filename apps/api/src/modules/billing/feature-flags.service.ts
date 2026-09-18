import { Injectable } from "@nestjs/common";
import type { FeatureFlagSummary } from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// A flag is globally on/off (defaultOn) unless this organization has its own target row.
// Toggling one's own org's targets is a self-serve beta opt-in — there's no platform-operator
// role in this codebase to reserve flag rollout for, so it's gated behind organization.billing
// (the same permission that gates plan changes) instead.
@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForOrganization(organizationId: string): Promise<FeatureFlagSummary[]> {
    const flags = await this.prisma.featureFlag.findMany({
      include: { targets: { where: { organizationId } } },
      orderBy: { key: "asc" },
    });
    return flags.map((f) => {
      const target = f.targets[0];
      return {
        key: f.key,
        description: f.description,
        enabled: target ? target.enabled : f.defaultOn,
        overridden: Boolean(target),
      };
    });
  }

  async setForOrganization(
    tenant: TenantContext,
    key: string,
    enabled: boolean,
    meta: RequestMeta,
  ): Promise<FeatureFlagSummary> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!flag) throw new NotFoundError("Feature flag");
    const existing = await this.prisma.featureFlagTarget.findFirst({
      where: { flagId: flag.id, organizationId: tenant.organizationId },
    });
    if (existing) {
      await this.prisma.featureFlagTarget.update({ where: { id: existing.id }, data: { enabled } });
    } else {
      await this.prisma.featureFlagTarget.create({
        data: { flagId: flag.id, organizationId: tenant.organizationId, enabled },
      });
    }
    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "feature_flag.toggled",
      resourceType: "feature_flag",
      resourceId: flag.id,
      after: { key, enabled },
      meta,
    });
    return { key: flag.key, description: flag.description, enabled, overridden: true };
  }
}
