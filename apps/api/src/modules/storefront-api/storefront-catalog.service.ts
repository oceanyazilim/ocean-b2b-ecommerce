import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  Money,
  Paginated,
  StorefrontCollectionDetail,
  StorefrontCollectionListQuery,
  StorefrontCollectionSummary,
  StorefrontProductDetail,
  StorefrontProductListQuery,
  StorefrontProductSummary,
  StorefrontVariantSummary,
} from "@ocean/types";

import { NotFoundError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { CatalogAccessService } from "../catalogs/catalog-access.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { PricingService } from "../pricing/pricing.service";

const mediaFirst = {
  orderBy: { position: "asc" as const },
  take: 1,
  include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
};

type PriceEntry = { unitPrice: Money; compareAtPrice: Money | null };
type ProductRow = Prisma.ProductGetPayload<{ include: { variants: true; media: typeof mediaFirst } }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The one place the Storefront API prices and filters a catalog. Unlike the admin catalog
// services this always: (a) applies CatalogAccessService so a restricted buyer never sees a
// product outside their assigned catalogs, and (b) prices through PricingService so the number
// shown is the buyer's real contract/volume price, never the raw base price or cost.
@Injectable()
export class StorefrontCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogAccess: CatalogAccessService,
    private readonly pricing: PricingService,
    private readonly reservations: InventoryReservationsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  // A logged-in customer prices and sees the catalog as their company (first active
  // membership); a guest or a customer with no company sees the public/unrestricted catalog.
  private async resolveBuyer(
    ctx: TenantContext,
  ): Promise<{ companyId: string | null; companyLocationId: string | null }> {
    if (ctx.actor.type !== "customer") return { companyId: null, companyLocationId: null };
    const membership = await this.prisma.companyUser.findFirst({
      where: { customerId: ctx.actor.id, status: "active" },
      select: { companyId: true },
    });
    return { companyId: membership?.companyId ?? null, companyLocationId: null };
  }

  private async priceByVariant(
    ctx: TenantContext,
    buyer: { companyId: string | null; companyLocationId: string | null },
    variantIds: string[],
  ): Promise<Map<string, PriceEntry>> {
    if (variantIds.length === 0) return new Map();
    const quote = await this.pricing.quote(ctx, {
      buyer: {
        ...(buyer.companyId ? { companyId: buyer.companyId } : {}),
        ...(buyer.companyLocationId ? { companyLocationId: buyer.companyLocationId } : {}),
      },
      items: variantIds.map((variantId) => ({ variantId, quantity: 1 })),
    });
    return new Map(
      quote.items.map((i) => [i.variantId, { unitPrice: i.unitPrice, compareAtPrice: i.compareAtPrice }]),
    );
  }

  private priceRange(variantIds: string[], priceByVariant: Map<string, PriceEntry>) {
    const priced = variantIds.map((id) => priceByVariant.get(id)).filter((p): p is PriceEntry => !!p);
    if (priced.length === 0) return null;
    const currency = priced[0]!.unitPrice.currency;
    const amounts = priced.map((p) => p.unitPrice.amount);
    return {
      min: { amount: Math.min(...amounts), currency },
      max: { amount: Math.max(...amounts), currency },
    };
  }

  private toSummary(row: ProductRow, priceByVariant: Map<string, PriceEntry>): StorefrontProductSummary {
    const first = row.media.find((m) => !m.media.deletedAt);
    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      image: first ? { url: this.storage.publicUrl(first.media.storageKey), alt: first.media.alt } : null,
      priceRange: this.priceRange(row.variants.map((v) => v.id), priceByVariant),
    };
  }

  async listProducts(
    ctx: TenantContext,
    query: StorefrontProductListQuery,
  ): Promise<Paginated<StorefrontProductSummary>> {
    const storeId = ctx.storeId as string;
    const buyer = await this.resolveBuyer(ctx);
    const access = await this.catalogAccess.resolve(ctx, buyer);
    const where: Prisma.ProductWhereInput = {
      storeId,
      deletedAt: null,
      status: "active",
      ...this.catalogAccess.productWhere(access),
      ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
      ...(query.collectionHandle
        ? { collections: { some: { collection: { handle: query.collectionHandle } } } }
        : {}),
    };
    const rows = await this.prisma.product.findMany({
      where,
      include: { variants: { orderBy: { position: "asc" } }, media: mediaFirst },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;

    const priceByVariant = await this.priceByVariant(
      ctx,
      buyer,
      page.flatMap((p) => p.variants.map((v) => v.id)),
    );
    return {
      data: page.map((p) => this.toSummary(p, priceByVariant)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async getProduct(ctx: TenantContext, idOrHandle: string): Promise<StorefrontProductDetail> {
    const storeId = ctx.storeId as string;
    const buyer = await this.resolveBuyer(ctx);
    const access = await this.catalogAccess.resolve(ctx, buyer);
    const row = await this.prisma.product.findFirst({
      where: {
        ...(UUID_RE.test(idOrHandle) ? { id: idOrHandle } : { handle: idOrHandle }),
        storeId,
        deletedAt: null,
        status: "active",
        ...this.catalogAccess.productWhere(access),
      },
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
        },
        media: { orderBy: { position: "asc" }, include: { media: true } },
        options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
      },
    });
    if (!row) throw new NotFoundError("Product");
    const variantIds = row.variants.map((v) => v.id);
    const [priceByVariant, availability, store] = await Promise.all([
      this.priceByVariant(ctx, buyer, variantIds),
      this.reservations.availability(ctx, variantIds),
      this.prisma.store.findUnique({ where: { id: storeId }, select: { defaultCurrency: true } }),
    ]);
    const currency = store?.defaultCurrency ?? "TRY";
    const media = row.media.filter((m) => !m.media.deletedAt);
    const first = media[0];
    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      image: first ? { url: this.storage.publicUrl(first.media.storageKey), alt: first.media.alt } : null,
      priceRange: this.priceRange(variantIds, priceByVariant),
      descriptionHtml: row.descriptionHtml ?? "",
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      options: row.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
      variants: row.variants.map((v): StorefrontVariantSummary => {
        const priced = priceByVariant.get(v.id);
        return {
          id: v.id,
          title: v.title,
          optionValues: v.optionValues
            .sort((a, b) => a.optionValue.option.position - b.optionValue.option.position)
            .map((ov) => ov.optionValue.value),
          sku: v.sku,
          price: priced?.unitPrice ?? { amount: Number(v.price), currency },
          compareAtPrice: priced?.compareAtPrice ?? null,
          available: availability.get(v.id) ?? null,
          requiresShipping: v.requiresShipping,
        };
      }),
      media: media.map((m) => ({
        id: m.media.id,
        kind: m.media.kind,
        url: this.storage.publicUrl(m.media.storageKey),
        alt: m.media.alt,
      })),
    };
  }

  async listCollections(
    ctx: TenantContext,
    query: StorefrontCollectionListQuery,
  ): Promise<Paginated<StorefrontCollectionSummary>> {
    const storeId = ctx.storeId as string;
    const rows = await this.prisma.collection.findMany({
      where: { storeId, deletedAt: null, publishedAt: { not: null } },
      include: { image: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((c) => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        image: c.image ? { url: this.storage.publicUrl(c.image.storageKey), alt: c.image.alt } : null,
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async getCollection(ctx: TenantContext, handle: string): Promise<StorefrontCollectionDetail> {
    const storeId = ctx.storeId as string;
    const buyer = await this.resolveBuyer(ctx);
    const access = await this.catalogAccess.resolve(ctx, buyer);
    const collection = await this.prisma.collection.findFirst({
      where: { storeId, handle, deletedAt: null, publishedAt: { not: null } },
      include: { image: true },
    });
    if (!collection) throw new NotFoundError("Collection");
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        deletedAt: null,
        status: "active",
        collections: { some: { collectionId: collection.id } },
        ...this.catalogAccess.productWhere(access),
      },
      include: { variants: { orderBy: { position: "asc" } }, media: mediaFirst },
      take: 60,
    });
    const priceByVariant = await this.priceByVariant(
      ctx,
      buyer,
      products.flatMap((p) => p.variants.map((v) => v.id)),
    );
    return {
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      image: collection.image
        ? { url: this.storage.publicUrl(collection.image.storageKey), alt: collection.image.alt }
        : null,
      descriptionHtml: collection.descriptionHtml ?? "",
      products: products.map((p) => this.toSummary(p, priceByVariant)),
    };
  }
}
