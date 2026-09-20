import type { Prisma } from "@ocean/db";
import type { ProductDetail, ProductStatus, ProductSummary } from "@ocean/types";

import type { StorageAdapter } from "../../../infrastructure/storage/storage.types";
import { toMoney, toMoneyOrNull } from "../money";

export const productSummaryInclude = {
  variants: {
    where: { deletedAt: null },
    select: { price: true },
  },
  media: {
    orderBy: { position: "asc" as const },
    take: 1,
    include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
  },
} satisfies Prisma.ProductInclude;

export const productDetailInclude = {
  options: {
    orderBy: { position: "asc" as const },
    include: { values: { orderBy: { position: "asc" as const } } },
  },
  variants: {
    where: { deletedAt: null },
    orderBy: { position: "asc" as const },
    include: { optionValues: { include: { optionValue: { include: { option: true } } } } },
  },
  media: { orderBy: { position: "asc" as const }, include: { media: true } },
  taxClass: { select: { name: true } },
} satisfies Prisma.ProductInclude;

type ProductSummaryRow = Prisma.ProductGetPayload<{ include: typeof productSummaryInclude }>;
type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

function priceRange(prices: readonly { price: bigint }[], currency: string) {
  if (prices.length === 0) return null;
  let min = prices[0]!.price;
  let max = prices[0]!.price;
  for (const p of prices) {
    if (p.price < min) min = p.price;
    if (p.price > max) max = p.price;
  }
  return { min: toMoney(min, currency), max: toMoney(max, currency) };
}

export function toProductSummary(
  row: ProductSummaryRow,
  currency: string,
  storage: StorageAdapter,
): ProductSummary {
  const first = row.media.find((m) => !m.media.deletedAt);
  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    status: row.status as ProductStatus,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    variantCount: row.variants.length,
    priceRange: priceRange(row.variants, currency),
    image: first ? { url: storage.publicUrl(first.media.storageKey), alt: first.media.alt } : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProductDetail(
  row: ProductDetailRow,
  currency: string,
  storage: StorageAdapter,
): ProductDetail {
  const optionOrder = new Map(row.options.map((o) => [o.id, o.position]));
  const media = row.media
    .filter((m) => !m.media.deletedAt)
    .map((m) => ({
      id: m.media.id,
      kind: m.media.kind,
      url: storage.publicUrl(m.media.storageKey),
      alt: m.media.alt,
      width: m.media.width,
      height: m.media.height,
      position: m.position,
    }));
  const first = media[0];

  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    status: row.status as ProductStatus,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    variantCount: row.variants.length,
    priceRange: priceRange(row.variants, currency),
    image: first ? { url: first.url, alt: first.alt } : null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    descriptionHtml: row.descriptionHtml,
    categoryId: row.categoryId,
    taxClassId: row.taxClassId,
    taxClassName: row.taxClass?.name ?? null,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    templateSuffix: row.templateSuffix,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    options: row.options.map((o) => ({
      id: o.id,
      name: o.name,
      position: o.position,
      values: o.values.map((v) => ({ id: v.id, value: v.value, position: v.position })),
    })),
    variants: row.variants.map((v) => ({
      id: v.id,
      title: v.title,
      optionValues: [...v.optionValues]
        .sort(
          (a, b) =>
            (optionOrder.get(a.optionValue.optionId) ?? 0) -
            (optionOrder.get(b.optionValue.optionId) ?? 0),
        )
        .map((ov) => ov.optionValue.value),
      sku: v.sku,
      barcode: v.barcode,
      price: toMoney(v.price, currency),
      compareAtPrice: toMoneyOrNull(v.compareAtPrice, currency),
      cost: toMoneyOrNull(v.cost, currency),
      weight: v.weight === null ? null : Number(v.weight),
      weightUnit: v.weightUnit,
      taxable: v.taxable,
      requiresShipping: v.requiresShipping,
      position: v.position,
    })),
    media,
  };
}
