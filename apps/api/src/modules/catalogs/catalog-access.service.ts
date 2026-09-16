import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";

import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import type { ResolvedTarget } from "./assignment-targets.service";

export interface CatalogAccess {
  // null = the buyer is not restricted (no active catalog assigned); otherwise the catalogs
  // whose union defines what they may see.
  catalogIds: string[] | null;
}

// The one place that answers "may this buyer see this product". Storefront listings, carts,
// checkout and quotes all go through here; the theme never filters on its own.
@Injectable()
export class CatalogAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(ctx: TenantContext, buyer: ResolvedTarget): Promise<CatalogAccess> {
    if (!buyer.companyId && !buyer.companyLocationId) return { catalogIds: null };
    const rows = await this.prisma.catalogAssignment.findMany({
      where: {
        storeId: ctx.storeId as string,
        catalog: { status: "active" },
        OR: [
          ...(buyer.companyId ? [{ companyId: buyer.companyId }] : []),
          ...(buyer.companyLocationId ? [{ companyLocationId: buyer.companyLocationId }] : []),
        ],
      },
      select: { catalogId: true },
    });
    if (rows.length === 0) return { catalogIds: null };
    return { catalogIds: [...new Set(rows.map((r) => r.catalogId))] };
  }

  // Prisma filter to AND into any product query on behalf of a buyer.
  productWhere(access: CatalogAccess): Prisma.ProductWhereInput {
    if (access.catalogIds === null) return {};
    return { catalogs: { some: { catalogId: { in: access.catalogIds } } } };
  }

  // Which of the given products the buyer may see (active products only).
  async visibleProductIds(
    ctx: TenantContext,
    access: CatalogAccess,
    productIds: readonly string[],
  ): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const rows = await this.prisma.product.findMany({
      where: {
        storeId: ctx.storeId as string,
        deletedAt: null,
        status: "active",
        id: { in: [...productIds] },
        ...this.productWhere(access),
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}
