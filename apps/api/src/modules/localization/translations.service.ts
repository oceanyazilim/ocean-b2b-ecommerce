import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import {
  PRODUCT_TRANSLATABLE_FIELDS,
  SYSTEM_LABEL_REGISTRY,
  type ProductTranslatableField,
  type ProductTranslationDetail,
  type ProductTranslationField,
  type ProductTranslationInput,
  type ProductTranslationListItem,
  type ProductTranslationListQuery,
  type SystemLabelEntry,
  type SystemLabelUpsertInput,
  type TranslationEntry,
  type TranslationStatus,
} from "@ocean/types";

import { NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { StoreLanguagesService } from "./store-languages.service";
import { TranslationMemoryService } from "./translation-memory.service";

type TranslationRow = Prisma.TranslationGetPayload<Record<string, never>>;

const STATUS_RANK: Record<TranslationStatus, number> = { draft: 0, reviewed: 1, published: 2 };
// A translatable field with no Translation row at all is worse than "draft" (it has never even
// been started), so it must outrank every real status when computing the worst-of summary below.
const NOT_TRANSLATED_RANK = -1;

function fieldRank(status: TranslationStatus | "not_translated"): number {
  return status === "not_translated" ? NOT_TRANSLATED_RANK : STATUS_RANK[status];
}

function toEntry(row: TranslationRow): TranslationEntry {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    locale: row.locale,
    field: row.field,
    value: row.value,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Products + a representative system-label slice (spec section 5's honest scope boundary — see
// the phase report). Both reuse the exact same generic Translation table
// (entityType/entityId/locale/field); a later pass can add Collections/Pages/Articles/Menus/
// checkout content by adding new entityType values here, with no schema change.
@Injectable()
export class TranslationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: StoreLanguagesService,
    private readonly memory: TranslationMemoryService,
  ) {}

  private async sourceLocale(ctx: TenantContext): Promise<string> {
    const def = await this.languages.getDefault(ctx);
    if (def) return def.locale;
    // Falls back to the store's own default locale (set at store creation, L1) when no
    // StoreLanguage row has been added yet — a store always has *some* notion of its default
    // language even before opting into the multi-language system this phase adds.
    const store = await this.prisma.store.findUnique({ where: { id: ctx.storeId as string }, select: { defaultLocale: true } });
    return store?.defaultLocale ?? "en-US";
  }

  // ---- products -------------------------------------------------------------------------------

  private async requireProduct(ctx: TenantContext, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId: ctx.storeId as string, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, title: true, handle: true, descriptionHtml: true, seoTitle: true, seoDescription: true },
    });
    if (!product) throw new NotFoundError("Product");
    return product;
  }

  private sourceValue(
    product: { title: string; descriptionHtml: string; seoTitle: string | null; seoDescription: string | null },
    field: ProductTranslatableField,
  ): string {
    return product[field] ?? "";
  }

  async listProductTranslations(
    ctx: TenantContext,
    query: ProductTranslationListQuery,
  ): Promise<ProductTranslationListItem[]> {
    const storeId = ctx.storeId as string;
    const products = await this.prisma.product.findMany({
      where: {
        storeId,
        organizationId: ctx.organizationId,
        deletedAt: null,
        ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
      },
      select: { id: true, title: true, handle: true },
      orderBy: { title: "asc" },
      take: 200,
    });
    if (products.length === 0) return [];

    const rows = await this.prisma.translation.findMany({
      where: {
        storeId,
        entityType: "product",
        locale: query.locale,
        entityId: { in: products.map((p) => p.id) },
      },
    });
    const byProduct = new Map<string, TranslationRow[]>();
    for (const row of rows) {
      const list = byProduct.get(row.entityId) ?? [];
      list.push(row);
      byProduct.set(row.entityId, list);
    }

    return products.map((p): ProductTranslationListItem => {
      const rowsForProduct = byProduct.get(p.id) ?? [];
      const byField = new Map(rowsForProduct.map((r) => [r.field, r.status]));
      // Worst status across the FULL set of translatable fields for this entity type — a field
      // with no row counts as "not_translated" (worse than draft), so a product that only has
      // one of several fields translated (even if that one is published) never reports as fully
      // "Published".
      const status: TranslationStatus | "not_translated" = PRODUCT_TRANSLATABLE_FIELDS.reduce<
        TranslationStatus | "not_translated"
      >((worst, field) => {
        const fieldStatus = byField.get(field) ?? "not_translated";
        return fieldRank(fieldStatus) < fieldRank(worst) ? fieldStatus : worst;
      }, "published");
      return {
        productId: p.id,
        productTitle: p.title,
        productHandle: p.handle,
        status,
        translatedFieldCount: rowsForProduct.length,
        totalFieldCount: PRODUCT_TRANSLATABLE_FIELDS.length,
      };
    });
  }

  async getProductTranslation(ctx: TenantContext, productId: string, locale: string): Promise<ProductTranslationDetail> {
    const product = await this.requireProduct(ctx, productId);
    const srcLocale = await this.sourceLocale(ctx);
    const rows = await this.prisma.translation.findMany({
      where: { storeId: ctx.storeId as string, entityType: "product", entityId: productId, locale },
    });
    const byField = new Map(rows.map((r) => [r.field, r]));

    const fields = {} as Record<ProductTranslatableField, ProductTranslationField | null>;
    for (const field of PRODUCT_TRANSLATABLE_FIELDS) {
      const row = byField.get(field);
      if (row) {
        fields[field] = { value: row.value, status: row.status, updatedAt: row.updatedAt.toISOString(), memorySuggestion: null };
      } else {
        const sourceText = this.sourceValue(product, field);
        const suggestion = sourceText.trim() ? await this.memory.lookup(ctx, srcLocale, locale, sourceText) : null;
        fields[field] = suggestion
          ? { value: "", status: "draft", updatedAt: new Date(0).toISOString(), memorySuggestion: suggestion.targetText }
          : null;
      }
    }

    return {
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      sourceLocale: srcLocale,
      locale,
      fields,
      source: {
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
      },
    };
  }

  async setProductTranslation(
    ctx: TenantContext,
    productId: string,
    input: ProductTranslationInput,
  ): Promise<ProductTranslationDetail> {
    const product = await this.requireProduct(ctx, productId);
    const srcLocale = await this.sourceLocale(ctx);
    if (srcLocale === input.locale) {
      throw new ValidationError("Cannot translate a product into its own source language.");
    }

    const updates: { field: ProductTranslatableField; value: string }[] = [];
    if (input.title !== undefined && input.title !== null) updates.push({ field: "title", value: input.title });
    if (input.descriptionHtml !== undefined && input.descriptionHtml !== null)
      updates.push({ field: "descriptionHtml", value: input.descriptionHtml });
    if (input.seoTitle !== undefined && input.seoTitle !== null) updates.push({ field: "seoTitle", value: input.seoTitle });
    if (input.seoDescription !== undefined && input.seoDescription !== null)
      updates.push({ field: "seoDescription", value: input.seoDescription });

    for (const { field, value } of updates) {
      await this.prisma.translation.upsert({
        where: {
          storeId_entityType_entityId_locale_field: {
            storeId: ctx.storeId as string,
            entityType: "product",
            entityId: productId,
            locale: input.locale,
            field,
          },
        },
        create: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          entityType: "product",
          entityId: productId,
          locale: input.locale,
          field,
          value,
          status: input.status ?? "draft",
          updatedById: ctx.actor.type === "user" ? ctx.actor.id : null,
        },
        // A saved edit always resets status to "draft" (content changed, needs re-review) unless
        // the caller explicitly passed a status (e.g. the "Mark as reviewed" / "Publish" action).
        update: {
          value,
          status: input.status ?? "draft",
          updatedById: ctx.actor.type === "user" ? ctx.actor.id : null,
        },
      });
      const sourceText = this.sourceValue(product, field);
      await this.memory.record(ctx, srcLocale, input.locale, sourceText, value);
    }

    return this.getProductTranslation(ctx, productId, input.locale);
  }

  async setProductTranslationStatus(
    ctx: TenantContext,
    productId: string,
    locale: string,
    status: TranslationStatus,
  ): Promise<ProductTranslationDetail> {
    await this.requireProduct(ctx, productId);
    const result = await this.prisma.translation.updateMany({
      where: { storeId: ctx.storeId as string, entityType: "product", entityId: productId, locale },
      data: { status },
    });
    if (result.count === 0) {
      throw new ValidationError("This product has no translated fields for that language yet.");
    }
    return this.getProductTranslation(ctx, productId, locale);
  }

  // ---- system labels (representative slice, spec section 5) -----------------------------------

  async listSystemLabels(ctx: TenantContext, locale: string): Promise<SystemLabelEntry[]> {
    const srcLocale = await this.sourceLocale(ctx);
    const keys = Object.keys(SYSTEM_LABEL_REGISTRY);
    const rows = await this.prisma.translation.findMany({
      where: { storeId: ctx.storeId as string, entityType: "system_label", locale, entityId: { in: keys } },
    });
    const byKey = new Map(rows.map((r) => [r.entityId, r]));

    const result: SystemLabelEntry[] = [];
    for (const key of keys) {
      const sourceText = SYSTEM_LABEL_REGISTRY[key] as string;
      const row = byKey.get(key);
      const translation = row ? toEntry(row) : null;
      const memorySuggestion = translation ? null : (await this.memory.lookup(ctx, srcLocale, locale, sourceText))?.targetText ?? null;
      result.push({ key, sourceText, translation, memorySuggestion });
    }
    return result;
  }

  async upsertSystemLabel(ctx: TenantContext, key: string, input: SystemLabelUpsertInput): Promise<SystemLabelEntry> {
    const sourceText = SYSTEM_LABEL_REGISTRY[key];
    if (sourceText === undefined) throw new NotFoundError("System label");
    const srcLocale = await this.sourceLocale(ctx);

    const row = await this.prisma.translation.upsert({
      where: {
        storeId_entityType_entityId_locale_field: {
          storeId: ctx.storeId as string,
          entityType: "system_label",
          entityId: key,
          locale: input.locale,
          field: "value",
        },
      },
      create: {
        storeId: ctx.storeId as string,
        organizationId: ctx.organizationId,
        entityType: "system_label",
        entityId: key,
        locale: input.locale,
        field: "value",
        value: input.value,
        status: input.status ?? "draft",
        updatedById: ctx.actor.type === "user" ? ctx.actor.id : null,
      },
      update: {
        value: input.value,
        status: input.status ?? "draft",
        updatedById: ctx.actor.type === "user" ? ctx.actor.id : null,
      },
    });
    await this.memory.record(ctx, srcLocale, input.locale, sourceText, input.value);
    return { key, sourceText, translation: toEntry(row), memorySuggestion: null };
  }

  // Storefront-facing (public): resolved label text per key for the given locale — published
  // translations only, falling back to the registry's default (source) text otherwise.
  async resolveSystemLabels(ctx: TenantContext, locale: string): Promise<Record<string, string>> {
    const keys = Object.keys(SYSTEM_LABEL_REGISTRY);
    const rows = await this.prisma.translation.findMany({
      where: {
        storeId: ctx.storeId as string,
        entityType: "system_label",
        locale,
        status: "published",
        entityId: { in: keys },
      },
    });
    const byKey = new Map(rows.map((r) => [r.entityId, r.value]));
    const out: Record<string, string> = {};
    for (const key of keys) out[key] = byKey.get(key) ?? (SYSTEM_LABEL_REGISTRY[key] as string);
    return out;
  }
}
