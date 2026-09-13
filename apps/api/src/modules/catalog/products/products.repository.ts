import { Injectable } from "@nestjs/common";
import type { Prisma, ProductStatus } from "@ocean/db";
import type { ProductListQuery } from "@ocean/types";

import type { TenantContext } from "../../../common/tenant/tenant-context";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { productDetailInclude, productSummaryInclude } from "./product.mapper";

const SORT: Record<ProductListQuery["sort"], Prisma.ProductOrderByWithRelationInput[]> = {
  created_desc: [{ createdAt: "desc" }, { id: "desc" }],
  created_asc: [{ createdAt: "asc" }, { id: "asc" }],
  updated_desc: [{ updatedAt: "desc" }, { id: "desc" }],
  title_asc: [{ title: "asc" }, { id: "asc" }],
  title_desc: [{ title: "desc" }, { id: "desc" }],
};

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private scope(ctx: TenantContext): Prisma.ProductWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null };
  }

  async list(ctx: TenantContext, query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.collectionId
        ? { collections: { some: { collectionId: query.collectionId } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { vendor: { contains: query.q, mode: "insensitive" } },
              { productType: { contains: query.q, mode: "insensitive" } },
              {
                variants: {
                  some: { deletedAt: null, sku: { contains: query.q, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      include: productSummaryInclude,
      orderBy: SORT[query.sort],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    return { rows: hasNextPage ? rows.slice(0, query.limit) : rows, hasNextPage };
  }

  findDetail(ctx: TenantContext, id: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.product.findFirst({
      where: { ...this.scope(ctx), id },
      include: productDetailInclude,
    });
  }

  findMany(ctx: TenantContext, ids: string[], tx: Prisma.TransactionClient = this.prisma) {
    return tx.product.findMany({ where: { ...this.scope(ctx), id: { in: ids } } });
  }

  handleExists(ctx: TenantContext, handle: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.product
      .findUnique({
        where: { storeId_handle: { storeId: ctx.storeId as string, handle } },
        select: { id: true },
      })
      .then(Boolean);
  }

  async skusInUse(
    ctx: TenantContext,
    skus: string[],
    excludeProductId: string | null,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<string[]> {
    if (skus.length === 0) return [];
    const rows = await tx.productVariant.findMany({
      where: {
        storeId: ctx.storeId as string,
        deletedAt: null,
        sku: { in: skus },
        ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      },
      select: { sku: true },
    });
    return rows.map((r) => r.sku as string);
  }

  async setStatusMany(
    ctx: TenantContext,
    ids: string[],
    status: ProductStatus,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.product.updateMany({
      where: { ...this.scope(ctx), id: { in: ids } },
      data: {
        status,
        version: { increment: 1 },
        ...(status === "active" ? { publishedAt: new Date() } : {}),
      },
    });
  }

  async softDeleteMany(ctx: TenantContext, ids: string[], tx: Prisma.TransactionClient) {
    const now = new Date();
    await tx.productVariant.updateMany({
      where: { storeId: ctx.storeId as string, productId: { in: ids }, deletedAt: null },
      data: { deletedAt: now },
    });
    await tx.collectionProduct.deleteMany({ where: { productId: { in: ids } } });
    return tx.product.updateMany({
      where: { ...this.scope(ctx), id: { in: ids } },
      data: { deletedAt: now, status: "archived", version: { increment: 1 } },
    });
  }

  mediaInTenant(ctx: TenantContext, ids: string[], tx: Prisma.TransactionClient = this.prisma) {
    return tx.media.findMany({
      where: { id: { in: ids }, storeId: ctx.storeId as string, deletedAt: null },
      select: { id: true },
    });
  }

  categoryInTenant(ctx: TenantContext, id: string, tx: Prisma.TransactionClient = this.prisma) {
    return tx.category.findFirst({
      where: { id, storeId: ctx.storeId as string },
      select: { id: true },
    });
  }
}
