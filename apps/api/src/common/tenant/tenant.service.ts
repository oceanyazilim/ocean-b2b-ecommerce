import { Injectable } from "@nestjs/common";
import { resolveOrganizationPermissions, resolveStorePermissions } from "@ocean/permissions";

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
        select: { role: true, status: true },
      }),
    ]);

    const organizationRole = orgMember?.status === "active" ? orgMember.role : null;
    const storeRole = storeMember?.status === "active" ? storeMember.role : null;
    if (!organizationRole && !storeRole) throw new NotFoundError("Store");

    return {
      organizationId: store.organizationId,
      storeId: store.id,
      actor: { type: "user", id: userId },
      organizationRole,
      storeRole,
      organizationPermissions: resolveOrganizationPermissions(organizationRole),
      storePermissions: resolveStorePermissions(organizationRole, storeRole),
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
}
