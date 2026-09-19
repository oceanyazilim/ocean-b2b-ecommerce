import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { Paginated, PlatformAuditLogEntry, PlatformAuditLogQuery } from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// The platform-wide counterpart of AuditService.listForStore (Phase 16) — same shape and cursor
// pagination, but with no store/organization scoping at all, plus cross-tenant filters and
// actor resolution across both identity tables (a User for merchant-attributed rows, a
// PlatformOperator for platform-attributed ones).
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: PlatformAuditLogQuery): Prisma.AuditLogWhereInput {
    return {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  async list(query: PlatformAuditLogQuery): Promise<Paginated<PlatformAuditLogEntry>> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(query),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        store: { select: { id: true, name: true } },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;

    const userIds = [
      ...new Set(
        page.filter((r) => r.actorType === "user" && r.actorId).map((r) => r.actorId as string),
      ),
    ];
    const operatorIds = [
      ...new Set(
        page.filter((r) => r.actorType === "platform" && r.actorId).map((r) => r.actorId as string),
      ),
    ];
    const [users, operators] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([]),
      operatorIds.length
        ? this.prisma.platformOperator.findMany({
            where: { id: { in: operatorIds } },
            select: { id: true, name: true, email: true },
          })
        : Promise.resolve([]),
    ]);
    const actorById = new Map([...users, ...operators].map((a) => [a.id, a]));

    return {
      data: page.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actorType: r.actorType,
        actor: r.actorId ? (actorById.get(r.actorId) ?? null) : null,
        organizationId: r.organizationId,
        organizationName: r.organization?.name ?? null,
        storeId: r.storeId,
        storeName: r.store?.name ?? null,
        before: r.before,
        after: r.after,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }
}
