import { Injectable } from "@nestjs/common";
import type { Organization } from "@ocean/db";
import type {
  CreateOrganizationInput,
  OrganizationSummary,
  UpdateOrganizationInput,
} from "@ocean/types";

import { ConflictError, ForbiddenError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { uniqueSlug } from "../../common/slug";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../users/users.service";
import { OrganizationsRepository } from "./organizations.repository";

export function toOrganizationSummary(org: Organization): OrganizationSummary {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: OrganizationsRepository,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    return (await this.repo.listForUser(userId)).map(toOrganizationSummary);
  }

  async create(
    userId: string,
    input: CreateOrganizationInput,
    meta: RequestMeta,
  ): Promise<OrganizationSummary> {
    const user = await this.users.findById(userId);
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenError("Verify your email address before creating an organization.");
    }

    const org = await this.prisma.$transaction(async (tx) => {
      if (input.slug && (await this.repo.slugExists(input.slug, tx))) {
        throw new ConflictError("This slug is already taken.", [
          { path: "slug", message: "Already taken" },
        ]);
      }
      const slug =
        input.slug ?? (await uniqueSlug(input.name, (c) => this.repo.slugExists(c, tx), "org"));
      const created = await this.repo.createWithOwner({ name: input.name, slug }, userId, tx);
      await this.audit.record(
        {
          organizationId: created.id,
          actorId: userId,
          action: "organization.created",
          resourceType: "organization",
          resourceId: created.id,
          after: { name: created.name, slug: created.slug },
          meta,
        },
        tx,
      );
      return created;
    });
    return toOrganizationSummary(org);
  }

  async get(tenant: TenantContext): Promise<OrganizationSummary> {
    const org = await this.repo.findById(tenant.organizationId);
    if (!org) throw new NotFoundError("Organization");
    return toOrganizationSummary(org);
  }

  async update(
    tenant: TenantContext,
    input: UpdateOrganizationInput,
    meta: RequestMeta,
  ): Promise<OrganizationSummary> {
    const before = await this.repo.findById(tenant.organizationId);
    if (!before) throw new NotFoundError("Organization");
    const after = await this.repo.update(tenant.organizationId, input);
    await this.audit.record({
      organizationId: tenant.organizationId,
      actorId: tenant.actor.id,
      action: "organization.updated",
      resourceType: "organization",
      resourceId: after.id,
      before: { name: before.name },
      after: { name: after.name },
      meta,
    });
    return toOrganizationSummary(after);
  }
}
