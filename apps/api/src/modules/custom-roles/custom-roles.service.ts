import { Injectable } from "@nestjs/common";
import { isStorePermission } from "@ocean/permissions";
import type { CreateCustomRoleInput, CustomRoleSummary, UpdateCustomRoleInput } from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

function assertKnownPermissions(permissions: string[]): void {
  const unknown = permissions.filter((p) => !isStorePermission(p));
  if (unknown.length) {
    throw new ValidationError(`Unknown permission(s): ${unknown.join(", ")}`, [
      { path: "permissions", message: `Unknown permission(s): ${unknown.join(", ")}` },
    ]);
  }
}

function toSummary(role: {
  id: string;
  name: string;
  permissions: string[];
  createdAt: Date;
  _count: { members: number };
}): CustomRoleSummary {
  return {
    id: role.id,
    name: role.name,
    permissions: role.permissions,
    memberCount: role._count.members,
    createdAt: role.createdAt.toISOString(),
  };
}

// A store-defined role, resolved by the same permission engine as the built-in StoreRole
// roles (see TenantService.forStore) — never hard-coded, per docs/architecture/07-auth-and-rbac.md.
@Injectable()
export class CustomRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenant: TenantContext): Promise<CustomRoleSummary[]> {
    const roles = await this.prisma.customRole.findMany({
      where: { storeId: tenant.storeId as string },
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "asc" },
    });
    return roles.map(toSummary);
  }

  async create(
    tenant: TenantContext,
    input: CreateCustomRoleInput,
    meta: RequestMeta,
  ): Promise<CustomRoleSummary> {
    assertKnownPermissions(input.permissions);
    try {
      const created = await this.prisma.customRole.create({
        data: {
          storeId: tenant.storeId as string,
          organizationId: tenant.organizationId,
          name: input.name,
          permissions: input.permissions,
        },
        include: { _count: { select: { members: true } } },
      });
      await this.audit.record({
        organizationId: tenant.organizationId,
        storeId: tenant.storeId,
        actorId: tenant.actor.id,
        action: "custom_role.created",
        resourceType: "custom_role",
        resourceId: created.id,
        after: { name: created.name, permissions: created.permissions },
        meta,
      });
      return toSummary(created);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        throw new ConflictError(`A role named "${input.name}" already exists.`, [
          { path: "name", message: "Already in use" },
        ]);
      }
      throw error;
    }
  }

  async update(
    tenant: TenantContext,
    id: string,
    input: UpdateCustomRoleInput,
    meta: RequestMeta,
  ): Promise<CustomRoleSummary> {
    if (input.permissions) assertKnownPermissions(input.permissions);
    const existing = await this.prisma.customRole.findFirst({
      where: { id, storeId: tenant.storeId as string },
    });
    if (!existing) throw new NotFoundError("Custom role");
    const updated = await this.prisma.customRole.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
      },
      include: { _count: { select: { members: true } } },
    });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "custom_role.updated",
      resourceType: "custom_role",
      resourceId: id,
      before: { name: existing.name, permissions: existing.permissions },
      after: { name: updated.name, permissions: updated.permissions },
      meta,
    });
    return toSummary(updated);
  }

  async remove(tenant: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const existing = await this.prisma.customRole.findFirst({
      where: { id, storeId: tenant.storeId as string },
      include: { _count: { select: { members: true } } },
    });
    if (!existing) throw new NotFoundError("Custom role");
    if (existing._count.members > 0) {
      throw new ConflictError(
        `"${existing.name}" is assigned to ${existing._count.members} member(s). Reassign them first.`,
      );
    }
    await this.prisma.customRole.delete({ where: { id } });
    await this.audit.record({
      organizationId: tenant.organizationId,
      storeId: tenant.storeId,
      actorId: tenant.actor.id,
      action: "custom_role.deleted",
      resourceType: "custom_role",
      resourceId: id,
      before: { name: existing.name },
      meta,
    });
  }
}
