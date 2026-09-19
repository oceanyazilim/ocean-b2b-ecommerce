import { Injectable } from "@nestjs/common";
import { createPermissionSet, resolveOrganizationPermissions, resolveStorePermissions, type StorePermission } from "@ocean/permissions";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { NotFoundError } from "../errors/domain-error";
import type { TenantContext } from "./tenant-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  // A user who is not a member sees the same 404 as a non-existent store, so tenant ids
  // cannot be enumerated.
  async forStore(userId: string, storeId: string, requestId: string): Promise<TenantContext> {
    if (!UUID.test(storeId)) throw new NotFoundError("Store");

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, organizationId: true },
    });
    if (!store) throw new NotFoundError("Store");

    const [orgMember, storeMember] = await Promise.all([
      this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: store.organizationId, userId } },
        select: { role: true, status: true },
      }),
      this.prisma.storeMember.findUnique({
        where: { storeId_userId: { storeId: store.id, userId } },
        select: { role: true, status: true, customRole: { select: { permissions: true } } },
      }),
    ]);

    const organizationRole = orgMember?.status === "active" ? orgMember.role : null;
    const storeRole = storeMember?.status === "active" ? storeMember.role : null;
    if (!organizationRole && !storeRole) throw new NotFoundError("Store");

    // A "custom" role carries no built-in grants (STORE_ROLE_PERMISSIONS.custom is empty) —
    // its actual permissions come from the linked CustomRole row, resolved here rather than
    // hard-coded, per docs/architecture/07-auth-and-rbac.md.
    const base = resolveStorePermissions(organizationRole, storeRole);
    const customPermissions = storeMember?.customRole?.permissions ?? [];
    const storePermissions = customPermissions.length
      ? createPermissionSet([...base, ...(customPermissions as StorePermission[])])
      : base;

    return {
      organizationId: store.organizationId,
      storeId: store.id,
      actor: { type: "user", id: userId },
      organizationRole,
      storeRole,
      organizationPermissions: resolveOrganizationPermissions(organizationRole),
      storePermissions,
      requestId,
    };
  }

  async forOrganization(
    userId: string,
    organizationId: string,
    requestId: string,
  ): Promise<TenantContext> {
    if (!UUID.test(organizationId)) throw new NotFoundError("Organization");

    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true, status: true, organization: { select: { id: true } } },
    });
    if (!member || member.status !== "active") throw new NotFoundError("Organization");

    return {
      organizationId,
      storeId: null,
      actor: { type: "user", id: userId },
      organizationRole: member.role,
      storeRole: null,
      organizationPermissions: resolveOrganizationPermissions(member.role),
      storePermissions: resolveStorePermissions(member.role, null),
      requestId,
    };
  }

  async forStorefront(
    hostname: string,
    customerId: string | null,
    requestId: string,
  ): Promise<TenantContext> {
    const domain = await this.prisma.domain.findUnique({
      where: { hostname },
      select: { storeId: true, organizationId: true },
    });
    if (!domain) throw new NotFoundError("Store");

    return {
      organizationId: domain.organizationId,
      storeId: domain.storeId,
      // A nil UUID, not a descriptive placeholder: actorId columns are plain @db.Uuid (no FK,
      // but the column type still rejects a non-UUID string) — every audit/event/order-event
      // write in the codebase passes ctx.actor.id straight through assuming that shape.
      actor: customerId
        ? { type: "customer", id: customerId }
        : { type: "guest", id: "00000000-0000-0000-0000-000000000000" },
      organizationRole: null,
      storeRole: null,
      // Storefront endpoints don't use these permissions (they check session vs resource),
      // but the context requires them.
      organizationPermissions: resolveOrganizationPermissions(null),
      storePermissions: resolveStorePermissions(null, null),
      requestId,
    };
  }
}
