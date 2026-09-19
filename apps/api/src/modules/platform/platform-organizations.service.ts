import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  Paginated,
  PlatformOrganizationDetail,
  PlatformOrganizationListQuery,
  PlatformOrganizationSummary,
  PlatformStoreListQuery,
  PlatformStoreSummary,
  SubscriptionDetail,
} from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { toPlanSummary } from "../billing/plans.service";

type OrgRow = Prisma.OrganizationGetPayload<{
  include: {
    _count: { select: { stores: true; members: true } };
    subscription: { include: { plan: true } };
  };
}>;

function toSummary(row: OrgRow): PlatformOrganizationSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    storeCount: row._count.stores,
    staffCount: row._count.members,
    planCode: row.subscription?.plan.code ?? null,
    planName: row.subscription?.plan.name ?? null,
    subscriptionStatus: row.subscription?.status ?? null,
  };
}

// Deliberately no tenant scoping anywhere in this service — every query here is cross-tenant by
// design (see PlatformModule's doc comment). It must only ever be reached through
// PlatformSessionGuard-gated controllers.
@Injectable()
export class PlatformOrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformOrganizationListQuery): Promise<Paginated<PlatformOrganizationSummary>> {
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { slug: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.organization.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { stores: true, members: { where: { status: "active" } } } },
        subscription: { include: { plan: true } },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toSummary),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async detail(organizationId: string): Promise<PlatformOrganizationDetail> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: { select: { stores: true, members: { where: { status: "active" } } } },
        subscription: { include: { plan: { include: { entitlements: true } } } },
        stores: {
          orderBy: { createdAt: "asc" },
          include: {
            _count: { select: { members: { where: { status: "active" } }, domains: true } },
          },
        },
      },
    });
    if (!org) throw new NotFoundError("Organization");

    const stores: PlatformStoreSummary[] = org.stores.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      status: s.status,
      organizationId: org.id,
      organizationName: org.name,
      defaultCurrency: s.defaultCurrency,
      defaultLocale: s.defaultLocale,
      staffCount: s._count.members,
      domainCount: s._count.domains,
      createdAt: s.createdAt.toISOString(),
    }));

    let subscription: SubscriptionDetail | null = null;
    if (org.subscription) {
      const sub = org.subscription;
      const planSummary = toPlanSummary(sub.plan);
      const storesMax =
        typeof planSummary.entitlements["stores.max"] === "number"
          ? (planSummary.entitlements["stores.max"] as number)
          : null;
      const staffMax =
        typeof planSummary.entitlements["staff.max"] === "number"
          ? (planSummary.entitlements["staff.max"] as number)
          : null;
      subscription = {
        id: sub.id,
        status: sub.status,
        plan: planSummary,
        trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAt: sub.cancelAt?.toISOString() ?? null,
        canceledAt: sub.canceledAt?.toISOString() ?? null,
        usage: {
          storesUsed: org._count.stores,
          storesMax,
          staffUsed: org._count.members,
          staffMax,
        },
      };
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt.toISOString(),
      storeCount: org._count.stores,
      staffCount: org._count.members,
      planCode: org.subscription?.plan.code ?? null,
      planName: org.subscription?.plan.name ?? null,
      subscriptionStatus: subscription?.status ?? null,
      stores,
      subscription,
    };
  }

  async listStores(query: PlatformStoreListQuery): Promise<Paginated<PlatformStoreSummary>> {
    const where: Prisma.StoreWhereInput = {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { slug: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.store.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { members: { where: { status: "active" } }, domains: true } },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        organizationId: s.organization.id,
        organizationName: s.organization.name,
        defaultCurrency: s.defaultCurrency,
        defaultLocale: s.defaultLocale,
        staffCount: s._count.members,
        domainCount: s._count.domains,
        createdAt: s.createdAt.toISOString(),
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }
}
