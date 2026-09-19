import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { Paginated, PlatformDomainListQuery, PlatformDomainSummary } from "@ocean/types";

import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class PlatformDomainsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformDomainListQuery): Promise<Paginated<PlatformDomainSummary>> {
    const where: Prisma.DomainWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { hostname: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const rows = await this.prisma.domain.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        store: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((d) => ({
        id: d.id,
        hostname: d.hostname,
        type: d.type,
        status: d.status,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        sslStatus: d.sslStatus,
        isPrimary: d.isPrimary,
        createdAt: d.createdAt.toISOString(),
        storeId: d.store.id,
        storeName: d.store.name,
        organizationId: d.organization.id,
        organizationName: d.organization.name,
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }
}
