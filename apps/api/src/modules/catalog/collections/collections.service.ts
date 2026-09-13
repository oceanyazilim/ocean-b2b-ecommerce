import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CollectionDetail,
  CollectionInput,
  CollectionListQuery,
  CollectionRule,
  CollectionSummary,
  CursorPaginationQuery,
  Paginated,
  ProductSummary,
  UpdateCollectionInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../../common/errors/domain-error";
import type { RequestMeta } from "../../../common/http/request-meta";
import { uniqueSlug } from "../../../common/slug";
import type { TenantContext } from "../../../common/tenant/tenant-context";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "../../../infrastructure/storage/storage.types";
import { AuditService } from "../../audit/audit.service";
import { EventsService } from "../../events/events.service";
import { productSummaryInclude, toProductSummary } from "../products/product.mapper";
import { sanitizeRichText } from "../sanitize";
import { matchesRules, type RuleProduct } from "./rule-engine";

const BATCH = 500;

const summaryInclude = {
  image: { select: { storageKey: true, alt: true, deletedAt: true } },
  _count: { select: { products: true } },
} satisfies Prisma.CollectionInclude;
type CollectionRow = Prisma.CollectionGetPayload<{ include: typeof summaryInclude }>;

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private scope(ctx: TenantContext): Prisma.CollectionWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null };
  }

  private toSummary(row: CollectionRow): CollectionSummary {
    return {
      id: row.id,
      title: row.title,
      handle: row.handle,
      type: row.type,
      productCount: row._count.products,
      published: row.publishedAt !== null,
      image:
        row.image && !row.image.deletedAt
          ? { url: this.storage.publicUrl(row.image.storageKey), alt: row.image.alt }
          : null,
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: CollectionRow): CollectionDetail {
    return {
      ...this.toSummary(row),
      descriptionHtml: row.descriptionHtml,
      rules: (row.rules as CollectionRule[] | null) ?? [],
      rulesMatchAll: row.rulesMatchAll,
      sortOrder: row.sortOrder,
      imageMediaId: row.imageMediaId,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
    };
  }

  async list(
    ctx: TenantContext,
    query: CollectionListQuery,
  ): Promise<Paginated<CollectionSummary>> {
    const rows = await this.prisma.collection.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.type ? { type: query.type } : {}),
        ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: summaryInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async get(ctx: TenantContext, id: string): Promise<CollectionDetail> {
    const row = await this.prisma.collection.findFirst({
      where: { ...this.scope(ctx), id },
      include: summaryInclude,
    });
    if (!row) throw new NotFoundError("Collection");
    return this.toDetail(row);
  }

  async create(
    ctx: TenantContext,
    input: CollectionInput,
    meta: RequestMeta,
  ): Promise<CollectionDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      const handle = await this.resolveHandle(ctx, input.title, input.handle, null, tx);
      await this.assertImage(ctx, input.imageMediaId ?? null, tx);
      const created = await tx.collection.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          title: input.title,
          handle,
          descriptionHtml: sanitizeRichText(input.descriptionHtml),
          type: input.type,
          rules:
            input.type === "automated" ? (input.rules as unknown as Prisma.InputJsonValue) : [],
          rulesMatchAll: input.rulesMatchAll,
          sortOrder: input.sortOrder,
          imageMediaId: input.imageMediaId ?? null,
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          publishedAt: input.published ? new Date() : null,
        },
      });
      if (created.type === "automated") await this.recomputeCollection(ctx, created.id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "collection.created",
          resourceType: "collection",
          resourceId: created.id,
          after: { title: created.title, handle, type: created.type },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "collection.created", { collectionId: created.id }, tx);
      return created.id;
    });
    return this.get(ctx, id);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateCollectionInput,
    meta: RequestMeta,
  ): Promise<CollectionDetail> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.collection.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Collection");
      if (current.version !== input.version) {
        throw new ConflictError(
          "This collection was changed by someone else. Reload to see the latest version.",
        );
      }
      if (current.type === "automated" && input.rules !== undefined && input.rules.length === 0) {
        throw new ValidationError("Automated collections need at least one rule.", [
          { path: "rules", message: "Add a rule" },
        ]);
      }
      const data: Prisma.CollectionUncheckedUpdateInput = { version: { increment: 1 } };
      if (input.title !== undefined) data.title = input.title;
      if (input.handle !== undefined && input.handle !== current.handle) {
        data.handle = await this.resolveHandle(
          ctx,
          input.title ?? current.title,
          input.handle,
          id,
          tx,
        );
      }
      if (input.descriptionHtml !== undefined)
        data.descriptionHtml = sanitizeRichText(input.descriptionHtml);
      if (input.rules !== undefined && current.type === "automated")
        data.rules = input.rules as unknown as Prisma.InputJsonValue;
      if (input.rulesMatchAll !== undefined) data.rulesMatchAll = input.rulesMatchAll;
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.imageMediaId !== undefined) {
        await this.assertImage(ctx, input.imageMediaId, tx);
        data.imageMediaId = input.imageMediaId;
      }
      if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
      if (input.published !== undefined)
        data.publishedAt = input.published ? (current.publishedAt ?? new Date()) : null;

      await tx.collection.update({ where: { id }, data });
      if (
        current.type === "automated" &&
        (input.rules !== undefined || input.rulesMatchAll !== undefined)
      ) {
        await this.recomputeCollection(ctx, id, tx);
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "collection.updated",
          resourceType: "collection",
          resourceId: id,
          before: { title: current.title },
          after: { title: input.title ?? current.title },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "collection.updated", { collectionId: id }, tx);
    });
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.collection.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Collection");
      await tx.collectionProduct.deleteMany({ where: { collectionId: id } });
      await tx.collection.update({
        where: { id },
        data: { deletedAt: new Date(), publishedAt: null, version: { increment: 1 } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "collection.deleted",
          resourceType: "collection",
          resourceId: id,
          before: { title: current.title, handle: current.handle },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "collection.deleted", { collectionId: id }, tx);
    });
  }

  // ---- membership ---------------------------------------------------------------------------

  async listProducts(
    ctx: TenantContext,
    id: string,
    query: CursorPaginationQuery,
  ): Promise<Paginated<ProductSummary>> {
    const collection = await this.prisma.collection.findFirst({
      where: { ...this.scope(ctx), id },
    });
    if (!collection) throw new NotFoundError("Collection");
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    const rows = await this.prisma.collectionProduct.findMany({
      where: { collectionId: id, product: { deletedAt: null } },
      include: { product: { include: productSummaryInclude } },
      orderBy: this.membershipOrder(collection.sortOrder),
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { collectionId_productId: { collectionId: id, productId: query.cursor } },
            skip: 1,
          }
        : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) =>
        toProductSummary(r.product, store?.defaultCurrency ?? "TRY", this.storage),
      ),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.productId ?? null) : null },
    };
  }

  private membershipOrder(sortOrder: string): Prisma.CollectionProductOrderByWithRelationInput[] {
    switch (sortOrder) {
      case "title_asc":
        return [{ product: { title: "asc" } }, { productId: "asc" }];
      case "title_desc":
        return [{ product: { title: "desc" } }, { productId: "asc" }];
      case "created_desc":
        return [{ product: { createdAt: "desc" } }, { productId: "asc" }];
      default:
        return [{ position: "asc" }, { productId: "asc" }];
    }
  }

  async addProducts(
    ctx: TenantContext,
    id: string,
    productIds: string[],
  ): Promise<{ added: number }> {
    return this.prisma.$transaction(async (tx) => {
      const collection = await this.manualCollection(ctx, id, tx);
      const owned = await tx.product.findMany({
        where: { id: { in: productIds }, storeId: ctx.storeId as string, deletedAt: null },
        select: { id: true },
      });
      const last = await tx.collectionProduct.aggregate({
        where: { collectionId: collection.id },
        _max: { position: true },
      });
      let position = (last._max.position ?? -1) + 1;
      let added = 0;
      for (const p of owned) {
        const res = await tx.collectionProduct.upsert({
          where: { collectionId_productId: { collectionId: collection.id, productId: p.id } },
          update: {},
          create: { collectionId: collection.id, productId: p.id, position, source: "manual" },
        });
        if (res.position === position) {
          added += 1;
          position += 1;
        }
      }
      await this.events.publish(ctx, "collection.updated", { collectionId: id, added }, tx);
      return { added };
    });
  }

  async removeProducts(
    ctx: TenantContext,
    id: string,
    productIds: string[],
  ): Promise<{ removed: number }> {
    const collection = await this.manualCollection(ctx, id);
    const res = await this.prisma.collectionProduct.deleteMany({
      where: { collectionId: collection.id, productId: { in: productIds } },
    });
    return { removed: res.count };
  }

  async reorderProducts(ctx: TenantContext, id: string, order: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const collection = await this.manualCollection(ctx, id, tx);
      const members = await tx.collectionProduct.findMany({
        where: { collectionId: collection.id },
        select: { productId: true },
      });
      const memberSet = new Set(members.map((m) => m.productId));
      const ordered = order.filter((p) => memberSet.has(p));
      const rest = members.map((m) => m.productId).filter((p) => !ordered.includes(p));
      let position = 0;
      for (const productId of [...ordered, ...rest]) {
        await tx.collectionProduct.update({
          where: { collectionId_productId: { collectionId: collection.id, productId } },
          data: { position },
        });
        position += 1;
      }
    });
  }

  private async manualCollection(
    ctx: TenantContext,
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const collection = await tx.collection.findFirst({ where: { ...this.scope(ctx), id } });
    if (!collection) throw new NotFoundError("Collection");
    if (collection.type !== "manual") {
      throw new ValidationError("Products in an automated collection are chosen by its rules.");
    }
    return collection;
  }

  // ---- automated collections ---------------------------------------------------------------

  async previewRules(
    ctx: TenantContext,
    rules: CollectionRule[],
    matchAll: boolean,
  ): Promise<{ count: number; sample: string[] }> {
    let count = 0;
    const sample: string[] = [];
    await this.forEachRuleProduct(ctx, this.prisma, (p, title) => {
      if (matchesRules(p, rules, matchAll)) {
        count += 1;
        if (sample.length < 5) sample.push(title);
      }
    });
    return { count, sample };
  }

  // Called inside the product transaction so memberships never lag behind product changes.
  async recomputeForProduct(
    ctx: TenantContext,
    productId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const automated = await tx.collection.findMany({
      where: { ...this.scope(ctx), type: "automated" },
      select: { id: true, rules: true, rulesMatchAll: true },
    });
    if (automated.length === 0) return;
    const product = await this.ruleProduct(tx, productId);
    for (const c of automated) {
      const rules = (c.rules as CollectionRule[] | null) ?? [];
      const shouldBeIn = product !== null && matchesRules(product, rules, c.rulesMatchAll);
      if (shouldBeIn) {
        await tx.collectionProduct.upsert({
          where: { collectionId_productId: { collectionId: c.id, productId } },
          update: { source: "rule" },
          create: { collectionId: c.id, productId, source: "rule", position: 0 },
        });
      } else {
        await tx.collectionProduct.deleteMany({
          where: { collectionId: c.id, productId, source: "rule" },
        });
      }
    }
  }

  async recomputeCollection(
    ctx: TenantContext,
    collectionId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const collection = await tx.collection.findFirst({
      where: { ...this.scope(ctx), id: collectionId, type: "automated" },
    });
    if (!collection) return;
    const rules = (collection.rules as CollectionRule[] | null) ?? [];
    const matched: string[] = [];
    await this.forEachRuleProduct(ctx, tx, (p, _title, id) => {
      if (matchesRules(p, rules, collection.rulesMatchAll)) matched.push(id);
    });
    await tx.collectionProduct.deleteMany({
      where: { collectionId, productId: { notIn: matched } },
    });
    for (const productId of matched) {
      await tx.collectionProduct.upsert({
        where: { collectionId_productId: { collectionId, productId } },
        update: { source: "rule" },
        create: { collectionId, productId, source: "rule", position: 0 },
      });
    }
  }

  private async ruleProduct(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<RuleProduct | null> {
    const p = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        category: { select: { path: true } },
        variants: { where: { deletedAt: null }, select: { price: true } },
      },
    });
    if (!p) return null;
    return {
      title: p.title,
      productType: p.productType,
      vendor: p.vendor,
      tags: p.tags,
      status: p.status,
      categoryPath: p.category?.path ?? null,
      minPrice: p.variants.length
        ? Number(p.variants.reduce((m, v) => (v.price < m ? v.price : m), p.variants[0]!.price))
        : null,
    };
  }

  private async forEachRuleProduct(
    ctx: TenantContext,
    tx: Prisma.TransactionClient,
    fn: (product: RuleProduct, title: string, id: string) => void,
  ): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const rows = await tx.product.findMany({
        where: { storeId: ctx.storeId as string, deletedAt: null },
        include: {
          category: { select: { path: true } },
          variants: { where: { deletedAt: null }, select: { price: true } },
        },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const p of rows) {
        fn(
          {
            title: p.title,
            productType: p.productType,
            vendor: p.vendor,
            tags: p.tags,
            status: p.status,
            categoryPath: p.category?.path ?? null,
            minPrice: p.variants.length
              ? Number(
                  p.variants.reduce((m, v) => (v.price < m ? v.price : m), p.variants[0]!.price),
                )
              : null,
          },
          p.title,
          p.id,
        );
      }
      if (rows.length < BATCH) break;
      cursor = rows.at(-1)?.id;
    }
  }

  private async resolveHandle(
    ctx: TenantContext,
    title: string,
    requested: string | undefined,
    excludeId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const exists = async (h: string) => {
      const row = await tx.collection.findUnique({
        where: { storeId_handle: { storeId: ctx.storeId as string, handle: h } },
        select: { id: true },
      });
      return !!row && row.id !== excludeId;
    };
    if (requested) {
      if (await exists(requested)) {
        throw new ConflictError("This handle is already used by another collection.", [
          { path: "handle", message: "Already taken" },
        ]);
      }
      return requested;
    }
    return uniqueSlug(title, exists, "collection");
  }

  private async assertImage(
    ctx: TenantContext,
    mediaId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    if (!mediaId) return;
    const media = await tx.media.findFirst({
      where: { id: mediaId, storeId: ctx.storeId as string, deletedAt: null, kind: "image" },
      select: { id: true },
    });
    if (!media)
      throw new ValidationError("Image not found in this store.", [
        { path: "imageMediaId", message: "Unknown image" },
      ]);
  }
}
