import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, ProductStatus } from "@ocean/db";
import type {
  CreateProductInput,
  Paginated,
  ProductBulkAction,
  ProductDetail,
  ProductListQuery,
  ProductSummary,
  UpdateProductInput,
  VariantInput,
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
import { SearchService } from "../../../infrastructure/search/search.service";
import { AuditService } from "../../audit/audit.service";
import { EventsService } from "../../events/events.service";
import { CollectionsService } from "../collections/collections.service";
import { sanitizeRichText } from "../sanitize";
import { toProductDetail, toProductSummary } from "./product.mapper";
import { ProductsRepository } from "./products.repository";
import { planVariants, VariantPlanError, variantTitle } from "./variants";

const ALLOWED_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  draft: ["active", "archived"],
  active: ["draft", "archived"],
  archived: ["draft"],
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: ProductsRepository,
    private readonly collections: CollectionsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly search: SearchService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private async currency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  async list(ctx: TenantContext, query: ProductListQuery): Promise<Paginated<ProductSummary>> {
    const currency = await this.currency(ctx);
    const { rows, hasNextPage } = await this.repo.list(ctx, query);
    return {
      data: rows.map((r) => toProductSummary(r, currency, this.storage)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (rows.at(-1)?.id ?? null) : null },
    };
  }

  // Large-catalog export: pages through the whole catalog with the same cursor mechanism the
  // list endpoint uses (never a single unbounded query), so this scales the same way a
  // paginated UI scroll would regardless of catalog size.
  async exportCsv(ctx: TenantContext): Promise<string> {
    const header = "Handle,Title,Status,Variant count,Min price,Max price,Currency";
    const lines: string[] = [];
    let cursor: string | undefined;
    const currency = await this.currency(ctx);
    for (let page = 0; page < 2000; page++) {
      const { rows, hasNextPage } = await this.repo.list(ctx, {
        limit: 250,
        cursor,
        sort: "created_desc",
      } as ProductListQuery);
      for (const r of rows) {
        const summary = toProductSummary(r, currency, this.storage);
        lines.push(
          [
            csvField(summary.handle),
            csvField(summary.title),
            summary.status,
            String(summary.variantCount),
            summary.priceRange ? (summary.priceRange.min.amount / 100).toFixed(2) : "",
            summary.priceRange ? (summary.priceRange.max.amount / 100).toFixed(2) : "",
            summary.priceRange?.min.currency ?? currency,
          ].join(","),
        );
      }
      if (!hasNextPage) break;
      cursor = rows.at(-1)?.id;
    }
    return [header, ...lines].join("\n");
  }

  async get(ctx: TenantContext, id: string): Promise<ProductDetail> {
    const row = await this.repo.findDetail(ctx, id);
    if (!row) throw new NotFoundError("Product");
    return toProductDetail(row, await this.currency(ctx), this.storage);
  }

  async create(
    ctx: TenantContext,
    input: CreateProductInput,
    meta: RequestMeta,
  ): Promise<ProductDetail> {
    const currency = await this.currency(ctx);
    const created = await this.prisma.$transaction(async (tx) => {
      const handle = await this.resolveHandle(ctx, input.title, input.handle, null, tx);
      await this.assertCategory(ctx, input.categoryId ?? null, tx);
      await this.assertSkusFree(ctx, input.variants, null, tx);
      const plan = this.plan(input.options, input.variants, []);

      const product = await tx.product.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          title: input.title,
          handle,
          descriptionHtml: sanitizeRichText(input.descriptionHtml),
          vendor: input.vendor ?? null,
          productType: input.productType ?? null,
          categoryId: input.categoryId ?? null,
          status: input.status,
          publishedAt: input.status === "active" ? new Date() : null,
          tags: normalizeTags(input.tags),
          seoTitle: input.seoTitle ?? null,
          seoDescription: input.seoDescription ?? null,
          templateSuffix: input.templateSuffix ?? null,
        },
      });

      const valueIds = await this.writeOptions(tx, product.id, input.options);
      await this.applyVariantPlan(tx, ctx, product.id, plan, valueIds);
      if (input.mediaIds?.length) await this.setMedia(ctx, product.id, input.mediaIds, tx);
      await this.collections.recomputeForProduct(ctx, product.id, tx);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "product.created",
          resourceType: "product",
          resourceId: product.id,
          after: { title: product.title, handle, status: product.status },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "product.created", { productId: product.id }, tx);
      return product.id;
    });
    this.search.indexProduct(ctx.storeId as string, created);
    const row = await this.repo.findDetail(ctx, created);
    return toProductDetail(row!, currency, this.storage);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateProductInput,
    meta: RequestMeta,
  ): Promise<ProductDetail> {
    const currency = await this.currency(ctx);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findDetail(ctx, id, tx);
      if (!current) throw new NotFoundError("Product");
      if (current.version !== input.version) {
        throw new ConflictError(
          "This product was changed by someone else. Reload to see the latest version.",
        );
      }

      const data: Prisma.ProductUncheckedUpdateInput = { version: { increment: 1 } };
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
      if (input.vendor !== undefined) data.vendor = input.vendor;
      if (input.productType !== undefined) data.productType = input.productType;
      if (input.categoryId !== undefined) {
        await this.assertCategory(ctx, input.categoryId, tx);
        data.categoryId = input.categoryId;
      }
      if (input.status !== undefined && input.status !== current.status) {
        this.assertTransition(current.status, input.status);
        data.status = input.status;
        if (input.status === "active" && !current.publishedAt) data.publishedAt = new Date();
      }
      if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
      if (input.seoTitle !== undefined) data.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined) data.seoDescription = input.seoDescription;
      if (input.templateSuffix !== undefined) data.templateSuffix = input.templateSuffix;

      await tx.product.update({ where: { id }, data });

      if (input.options !== undefined || input.variants !== undefined) {
        const options =
          input.options ??
          current.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) }));
        const variants = input.variants ?? this.currentVariantInputs(current);
        await this.assertSkusFree(ctx, variants, id, tx);
        const optionOrder = new Map(current.options.map((o) => [o.id, o.position]));
        const existing = current.variants.map((v) => ({
          id: v.id,
          optionValues: [...v.optionValues]
            .sort(
              (a, b) =>
                (optionOrder.get(a.optionValue.optionId) ?? 0) -
                (optionOrder.get(b.optionValue.optionId) ?? 0),
            )
            .map((ov) => ov.optionValue.value),
        }));
        const plan = this.plan(options, variants, existing);
        const valueIds = await this.writeOptions(tx, id, options);
        await this.applyVariantPlan(tx, ctx, id, plan, valueIds);
      }
      if (input.mediaIds !== undefined) await this.setMedia(ctx, id, input.mediaIds, tx);

      await this.collections.recomputeForProduct(ctx, id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "product.updated",
          resourceType: "product",
          resourceId: id,
          before: { title: current.title, status: current.status },
          after: { title: input.title ?? current.title, status: input.status ?? current.status },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "product.updated", { productId: id }, tx);
    });
    this.search.indexProduct(ctx.storeId as string, id);
    const row = await this.repo.findDetail(ctx, id);
    return toProductDetail(row!, currency, this.storage);
  }

  async setStatus(
    ctx: TenantContext,
    id: string,
    status: ProductStatus,
    meta: RequestMeta,
  ): Promise<ProductDetail> {
    const currency = await this.currency(ctx);
    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findDetail(ctx, id, tx);
      if (!current) throw new NotFoundError("Product");
      if (current.status === status) return;
      this.assertTransition(current.status, status);
      await this.repo.setStatusMany(ctx, [id], status, tx);
      await this.collections.recomputeForProduct(ctx, id, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: status === "archived" ? "product.archived" : "product.updated",
          resourceType: "product",
          resourceId: id,
          before: { status: current.status },
          after: { status },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        status === "archived" ? "product.archived" : "product.updated",
        { productId: id, status },
        tx,
      );
    });
    this.search.indexProduct(ctx.storeId as string, id);
    const row = await this.repo.findDetail(ctx, id);
    return toProductDetail(row!, currency, this.storage);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findDetail(ctx, id, tx);
      if (!current) throw new NotFoundError("Product");
      await this.repo.softDeleteMany(ctx, [id], tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "product.deleted",
          resourceType: "product",
          resourceId: id,
          before: { title: current.title, handle: current.handle },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "product.deleted", { productId: id }, tx);
    });
    this.search.deleteProduct(ctx.storeId as string, id);
  }

  // Admin-triggered backfill (spec: "Reindex search"). Needed once for stores/products that
  // predate this feature, and safe to re-run any time as a manual repair — it fully replaces the
  // store's Meilisearch index from the current Postgres state.
  async reindexSearch(ctx: TenantContext): Promise<{ indexed: number }> {
    return this.search.reindexStore(ctx.storeId as string);
  }

  async bulk(
    ctx: TenantContext,
    action: ProductBulkAction,
    meta: RequestMeta,
  ): Promise<{ affected: number }> {
    let indexedIds: string[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const found = await this.repo.findMany(ctx, action.ids, tx);
      const ids = found.map((p) => p.id);
      if (ids.length === 0) return { affected: 0 };
      indexedIds = ids;

      switch (action.action) {
        case "archive":
          await this.repo.setStatusMany(ctx, ids, "archived", tx);
          break;
        case "unarchive":
          await this.repo.setStatusMany(ctx, ids, "draft", tx);
          break;
        case "delete":
          await this.repo.softDeleteMany(ctx, ids, tx);
          break;
        case "add_tag":
        case "remove_tag": {
          const tag = action.tag as string;
          for (const p of found) {
            const tags =
              action.action === "add_tag"
                ? normalizeTags([...p.tags, tag])
                : p.tags.filter((t) => t !== tag);
            await tx.product.update({
              where: { id: p.id },
              data: { tags, version: { increment: 1 } },
            });
          }
          break;
        }
      }
      for (const id of ids) {
        if (action.action !== "delete") await this.collections.recomputeForProduct(ctx, id, tx);
        await this.events.publish(
          ctx,
          action.action === "delete" ? "product.deleted" : "product.updated",
          { productId: id, bulk: action.action },
          tx,
        );
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: `product.bulk_${action.action}`,
          resourceType: "product",
          metadata: { ids, tag: action.tag },
          meta,
        },
        tx,
      );
      return { affected: ids.length };
    });
    const storeId = ctx.storeId as string;
    for (const id of indexedIds) {
      if (action.action === "delete") this.search.deleteProduct(storeId, id);
      else this.search.indexProduct(storeId, id);
    }
    return result;
  }

  // ---- media --------------------------------------------------------------------------------

  async attachMedia(ctx: TenantContext, id: string, mediaId: string): Promise<ProductDetail> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findDetail(ctx, id, tx);
      if (!current) throw new NotFoundError("Product");
      const owned = await this.repo.mediaInTenant(ctx, [mediaId], tx);
      if (owned.length === 0) throw new NotFoundError("Media");
      const position = current.media.length;
      await tx.productMedia.upsert({
        where: { productId_mediaId: { productId: id, mediaId } },
        update: {},
        create: { productId: id, mediaId, position },
      });
    });
    return this.get(ctx, id);
  }

  async detachMedia(ctx: TenantContext, id: string, mediaId: string): Promise<ProductDetail> {
    const current = await this.repo.findDetail(ctx, id);
    if (!current) throw new NotFoundError("Product");
    await this.prisma.productMedia.deleteMany({ where: { productId: id, mediaId } });
    return this.get(ctx, id);
  }

  async reorderMedia(ctx: TenantContext, id: string, order: string[]): Promise<ProductDetail> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.repo.findDetail(ctx, id, tx);
      if (!current) throw new NotFoundError("Product");
      const attached = new Set(current.media.map((m) => m.mediaId));
      const ordered = order.filter((m) => attached.has(m));
      const rest = current.media.map((m) => m.mediaId).filter((m) => !ordered.includes(m));
      let position = 0;
      for (const mediaId of [...ordered, ...rest]) {
        await tx.productMedia.update({
          where: { productId_mediaId: { productId: id, mediaId } },
          data: { position },
        });
        position += 1;
      }
    });
    return this.get(ctx, id);
  }

  // ---- internals ----------------------------------------------------------------------------

  private plan(
    options: CreateProductInput["options"],
    variants: VariantInput[],
    existing: { id: string; optionValues: string[] }[],
  ) {
    try {
      return planVariants(options, variants, existing);
    } catch (error) {
      if (error instanceof VariantPlanError) {
        throw new ValidationError(error.message, [{ path: "variants", message: error.message }]);
      }
      throw error;
    }
  }

  private currentVariantInputs(
    current: NonNullable<Awaited<ReturnType<ProductsRepository["findDetail"]>>>,
  ): VariantInput[] {
    const optionOrder = new Map(current.options.map((o) => [o.id, o.position]));
    return current.variants.map((v) => ({
      id: v.id,
      optionValues: [...v.optionValues]
        .sort(
          (a, b) =>
            (optionOrder.get(a.optionValue.optionId) ?? 0) -
            (optionOrder.get(b.optionValue.optionId) ?? 0),
        )
        .map((ov) => ov.optionValue.value),
      sku: v.sku,
      barcode: v.barcode,
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice === null ? null : Number(v.compareAtPrice),
      cost: v.cost === null ? null : Number(v.cost),
      weight: v.weight === null ? null : Number(v.weight),
      weightUnit: v.weightUnit,
      taxable: v.taxable,
      requiresShipping: v.requiresShipping,
    }));
  }

  private async resolveHandle(
    ctx: TenantContext,
    title: string,
    requested: string | undefined,
    excludeId: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const exists = async (h: string) => {
      const row = await tx.product.findUnique({
        where: { storeId_handle: { storeId: ctx.storeId as string, handle: h } },
        select: { id: true },
      });
      return !!row && row.id !== excludeId;
    };
    if (requested) {
      if (await exists(requested)) {
        throw new ConflictError("This handle is already used by another product.", [
          { path: "handle", message: "Already taken" },
        ]);
      }
      return requested;
    }
    return uniqueSlug(title, exists, "product");
  }

  private async assertCategory(
    ctx: TenantContext,
    categoryId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    if (!categoryId) return;
    if (!(await this.repo.categoryInTenant(ctx, categoryId, tx))) {
      throw new ValidationError("Category not found in this store.", [
        { path: "categoryId", message: "Unknown category" },
      ]);
    }
  }

  private async assertSkusFree(
    ctx: TenantContext,
    variants: VariantInput[],
    excludeProductId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    const skus = variants.map((v) => v.sku).filter((s): s is string => !!s);
    if (new Set(skus).size !== skus.length) {
      throw new ValidationError("SKUs must be unique within the product.", [
        { path: "variants", message: "Duplicate SKU" },
      ]);
    }
    const taken = await this.repo.skusInUse(ctx, skus, excludeProductId, tx);
    if (taken.length) {
      throw new ConflictError(
        `SKU already in use: ${taken.join(", ")}`,
        taken.map((s) => ({ path: "variants", message: `SKU ${s} is taken` })),
      );
    }
  }

  private assertTransition(from: ProductStatus, to: ProductStatus) {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new ValidationError(`Cannot move a ${from} product to ${to}.`, [
        { path: "status", message: "Invalid transition" },
      ]);
    }
  }

  // Rewrites options/values to match the input while keeping ids of unchanged names/values.
  private async writeOptions(
    tx: Prisma.TransactionClient,
    productId: string,
    options: CreateProductInput["options"],
  ) {
    const existing = await tx.productOption.findMany({
      where: { productId },
      include: { values: true },
    });
    const valueIds = new Map<string, string>();
    const keepOptionIds: string[] = [];

    for (const [position, option] of options.entries()) {
      const found = existing.find((e) => e.name.toLowerCase() === option.name.toLowerCase());
      const row = found
        ? await tx.productOption.update({
            where: { id: found.id },
            data: { name: option.name, position },
          })
        : await tx.productOption.create({ data: { productId, name: option.name, position } });
      keepOptionIds.push(row.id);
      const keepValueIds: string[] = [];
      for (const [vpos, value] of option.values.entries()) {
        const foundValue = found?.values.find((v) => v.value.toLowerCase() === value.toLowerCase());
        const vrow = foundValue
          ? await tx.productOptionValue.update({
              where: { id: foundValue.id },
              data: { value, position: vpos },
            })
          : await tx.productOptionValue.create({
              data: { optionId: row.id, value, position: vpos },
            });
        keepValueIds.push(vrow.id);
        valueIds.set(`${position}:${value}`, vrow.id);
      }
      await tx.productOptionValue.deleteMany({
        where: { optionId: row.id, id: { notIn: keepValueIds } },
      });
    }
    await tx.productOption.deleteMany({ where: { productId, id: { notIn: keepOptionIds } } });
    return valueIds;
  }

  private async applyVariantPlan(
    tx: Prisma.TransactionClient,
    ctx: TenantContext,
    productId: string,
    plan: ReturnType<typeof planVariants>,
    valueIds: Map<string, string>,
  ) {
    const positionOf = new Map(plan.order.map((key, i) => [key, i]));
    const data = (v: VariantInput) => ({
      title: variantTitle(v.optionValues),
      sku: v.sku ?? null,
      barcode: v.barcode ?? null,
      price: BigInt(v.price),
      compareAtPrice:
        v.compareAtPrice === null || v.compareAtPrice === undefined
          ? null
          : BigInt(v.compareAtPrice),
      cost: v.cost === null || v.cost === undefined ? null : BigInt(v.cost),
      weight: v.weight ?? null,
      weightUnit: v.weightUnit,
      taxable: v.taxable,
      requiresShipping: v.requiresShipping,
      position: positionOf.get(v.optionValues.join(" ")) ?? 0,
    });
    const links = (v: VariantInput) =>
      v.optionValues.map((value, i) => valueIds.get(`${i}:${value}`) as string);

    if (plan.removeIds.length) {
      await tx.productVariant.updateMany({
        where: { id: { in: plan.removeIds } },
        data: { deletedAt: new Date() },
      });
      await tx.variantOptionValue.deleteMany({ where: { variantId: { in: plan.removeIds } } });
    }
    for (const { id, input } of plan.update) {
      await tx.productVariant.update({ where: { id }, data: data(input) });
      await tx.variantOptionValue.deleteMany({ where: { variantId: id } });
      if (input.optionValues.length) {
        await tx.variantOptionValue.createMany({
          data: links(input).map((optionValueId) => ({ variantId: id, optionValueId })),
        });
      }
    }
    for (const input of plan.create) {
      const created = await tx.productVariant.create({
        data: { ...data(input), productId, storeId: ctx.storeId as string },
      });
      if (input.optionValues.length) {
        await tx.variantOptionValue.createMany({
          data: links(input).map((optionValueId) => ({ variantId: created.id, optionValueId })),
        });
      }
    }
  }

  private async setMedia(
    ctx: TenantContext,
    productId: string,
    mediaIds: string[],
    tx: Prisma.TransactionClient,
  ) {
    const owned = new Set((await this.repo.mediaInTenant(ctx, mediaIds, tx)).map((m) => m.id));
    const ordered = mediaIds.filter((m, i) => owned.has(m) && mediaIds.indexOf(m) === i);
    await tx.productMedia.deleteMany({ where: { productId, mediaId: { notIn: ordered } } });
    for (const [position, mediaId] of ordered.entries()) {
      await tx.productMedia.upsert({
        where: { productId_mediaId: { productId, mediaId } },
        update: { position },
        create: { productId, mediaId, position },
      });
    }
  }
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

function csvField(value: string): string {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @ (or tab/CR) makes Excel/
  // Sheets treat the cell as a formula when the exported file is opened, not as plain text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
