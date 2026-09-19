import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@ocean/db";
import { Meilisearch } from "meilisearch";

import type { Env } from "../../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { SearchProductDocument } from "./search.types";

const productWithVariants = {
  include: { variants: { where: { deletedAt: null }, select: { sku: true, title: true } } },
} satisfies Prisma.ProductDefaultArgs;
type ProductWithVariants = Prisma.ProductGetPayload<typeof productWithVariants>;

const BACKFILL_BATCH = 500;

// Wraps the Meilisearch client with this codebase's tenant-isolation pattern: one index per
// store (`products_<storeId>`), never a shared index filtered by storeId. A cross-tenant query
// literally cannot reach another store's documents — there is no filter to get wrong.
//
// This service only ever answers "which product ids matched this text query". It never returns
// price, stock, or anything else a caller could be tempted to trust — StorefrontSearchService
// re-hydrates every matched id through CatalogAccessService + PricingService against Postgres,
// exactly like every other storefront product read. See docs comment on StorefrontCatalogService.
//
// Indexing is synchronous-but-non-blocking: ProductsService calls indexProduct()/deleteProduct()
// after a write commits, and these methods return immediately (void), doing the actual Meilisearch
// call in the background with errors caught and logged. A Meilisearch hiccup can never fail a
// product save — this mirrors the "no queue infra beyond a lightweight poller" maturity level the
// rest of this codebase uses for non-critical side effects.
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Meilisearch;
  private readonly configuredIndexes = new Set<string>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.client = new Meilisearch({
      host: config.get("MEILI_HOST", { infer: true }),
      apiKey: config.get("MEILI_MASTER_KEY", { infer: true }),
    });
  }

  private indexName(storeId: string): string {
    return `products_${storeId}`;
  }

  private async ensureIndexSettings(storeId: string): Promise<void> {
    if (this.configuredIndexes.has(storeId)) return;
    const uid = this.indexName(storeId);
    try {
      await this.client.createIndex(uid, { primaryKey: "id" }).catch(() => undefined);
      await this.client.index(uid).updateSettings({
        // Title/vendor/sku/tags rank above the (long, low-signal) description.
        searchableAttributes: ["title", "variantSkus", "vendor", "tags", "productType", "variantTitles", "description"],
        filterableAttributes: ["status"],
        sortableAttributes: ["createdAt"],
      });
      this.configuredIndexes.add(storeId);
    } catch (error) {
      this.logger.error(`Failed to configure search index for store ${storeId}`, error as Error);
    }
  }

  private toDocument(product: ProductWithVariants): SearchProductDocument {
    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor ?? "",
      productType: product.productType ?? "",
      tags: product.tags,
      description: stripHtml(product.descriptionHtml).slice(0, 2000),
      variantSkus: product.variants.map((v) => v.sku).filter((s): s is string => !!s),
      variantTitles: [...new Set(product.variants.map((v) => v.title))],
      status: product.status,
      createdAt: product.createdAt.getTime(),
    };
  }

  // Fire-and-forget upsert. Re-reads the product itself (rather than taking it as a parameter)
  // so every call site — create/update/status change/bulk — stays a one-line, non-blocking call.
  indexProduct(storeId: string, productId: string): void {
    void this.syncProduct(storeId, productId).catch((error) =>
      this.logger.error(`Failed to index product ${productId} for store ${storeId}`, error as Error),
    );
  }

  private async syncProduct(storeId: string, productId: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
      ...productWithVariants,
    });
    if (!product || product.deletedAt) {
      this.deleteProduct(storeId, productId);
      return;
    }
    await this.ensureIndexSettings(storeId);
    await this.client.index(this.indexName(storeId)).addDocuments([this.toDocument(product)]);
  }

  // Fire-and-forget delete, same non-blocking contract as indexProduct.
  deleteProduct(storeId: string, productId: string): void {
    this.client
      .index(this.indexName(storeId))
      .deleteDocument(productId)
      .catch((error) =>
        this.logger.error(`Failed to remove product ${productId} from search index (store ${storeId})`, error as Error),
      );
  }

  // Returns matched product ids, most-relevant first, restricted to currently-active products.
  // Never throws: a Meilisearch outage degrades storefront search to "no results" instead of a
  // broken storefront.
  async matchProductIds(storeId: string, q: string, limit: number): Promise<string[]> {
    try {
      const result = await this.client.index<SearchProductDocument>(this.indexName(storeId)).search(q, {
        filter: "status = active",
        limit,
        attributesToRetrieve: ["id"],
      });
      return result.hits.map((h) => h.id);
    } catch (error) {
      this.logger.error(`Search query failed for store ${storeId}`, error as Error);
      return [];
    }
  }

  // Full backfill for a store — clears the index, then re-adds every non-deleted product. Used
  // by the admin-triggered "Reindex search" action and the one-off backfill script, since
  // products created before this feature existed were never indexed.
  async reindexStore(storeId: string): Promise<{ indexed: number }> {
    await this.ensureIndexSettings(storeId);
    const index = this.client.index(this.indexName(storeId));
    await index.deleteAllDocuments();

    let indexed = 0;
    let cursor: string | undefined;
    for (;;) {
      const products = await this.prisma.product.findMany({
        where: { storeId, deletedAt: null },
        ...productWithVariants,
        orderBy: { id: "asc" },
        take: BACKFILL_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (products.length === 0) break;
      await index.addDocuments(products.map((p) => this.toDocument(p)));
      indexed += products.length;
      if (products.length < BACKFILL_BATCH) break;
      cursor = products.at(-1)!.id;
    }
    return { indexed };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
