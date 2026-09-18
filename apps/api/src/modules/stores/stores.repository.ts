import { Injectable } from "@nestjs/common";
import type { Prisma, Store } from "@ocean/db";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { TenantContext } from "../../common/tenant/tenant-context";

// Every read is scoped by the tenant's organization/store id; there is no unscoped lookup.
@Injectable()
export class StoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  slugExists(slug: string, tx: Prisma.TransactionClient = this.prisma): Promise<boolean> {
    return tx.store.findUnique({ where: { slug }, select: { id: true } }).then(Boolean);
  }

  findInTenant(ctx: TenantContext): Promise<Store | null> {
    if (!ctx.storeId) return Promise.resolve(null);
    return this.prisma.store.findFirst({
      where: { id: ctx.storeId, organizationId: ctx.organizationId },
    });
  }

  listForOrganization(ctx: TenantContext): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  countForOrganization(organizationId: string): Promise<number> {
    return this.prisma.store.count({ where: { organizationId } });
  }

  createWithOwner(
    ctx: TenantContext,
    data: Omit<Prisma.StoreUncheckedCreateInput, "organizationId" | "members">,
    ownerUserId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Store> {
    return tx.store.create({
      data: {
        ...data,
        organizationId: ctx.organizationId,
        members: {
          create: { organizationId: ctx.organizationId, userId: ownerUserId, role: "store_owner" },
        },
      },
    });
  }

  update(ctx: TenantContext, data: Prisma.StoreUncheckedUpdateInput): Promise<Store> {
    return this.prisma.store.update({
      where: { id: ctx.storeId as string, organizationId: ctx.organizationId },
      data,
    });
  }
}
