import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CatalogStatus,
  CompanyPricingOverview,
  PriceListStatus,
  PricedItem,
  PricingQuote,
  PricingQuoteInput,
  VolumeTier,
  VolumeTierType,
} from "@ocean/types";

import { NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import {
  AssignmentTargetsService,
  type ResolvedTarget,
} from "../catalogs/assignment-targets.service";
import { CatalogAccessService } from "../catalogs/catalog-access.service";
import { toMoney, toMoneyOrNull } from "../catalog/money";
import { checkQuantityRule, resolvePrice, selectTier, tierUnitPrice } from "./pricing-engine";

const SCOPE_RANK = { variant: 0, product: 1, collection: 2, store: 3 } as const;

type VariantRow = Prisma.ProductVariantGetPayload<{
  include: {
    product: {
      select: { id: true; status: true; collections: { select: { collectionId: true } } };
    };
  };
}>;

// The pricing boundary (spec §21). Carts, checkout, quotes and the storefront ask this service
// for prices; nothing else reads price tables. Everything is computed server-side from the
// buyer context, never from client-supplied amounts.
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AssignmentTargetsService,
    private readonly catalogAccess: CatalogAccessService,
  ) {}

  async quote(ctx: TenantContext, input: PricingQuoteInput): Promise<PricingQuote> {
    const storeId = ctx.storeId as string;
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";
    const buyer = await this.targets.resolveBuyer(ctx, input.buyer);

    const variantIds = [...new Set(input.items.map((i) => i.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { storeId, deletedAt: null, product: { deletedAt: null }, id: { in: variantIds } },
      include: {
        product: {
          select: { id: true, status: true, collections: { select: { collectionId: true } } },
        },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const missing = variantIds.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new ValidationError("One or more variants are not in this store.", [
        { path: "items", message: `Unknown variant ${missing[0]}` },
      ]);
    }

    const access = await this.catalogAccess.resolve(ctx, buyer);
    const visible = await this.catalogAccess.visibleProductIds(
      ctx,
      access,
      variants.map((v) => v.product.id),
    );
    const [contracts, priceList, volumeRules, quantityRules] = await Promise.all([
      this.loadContracts(storeId, buyer, variantIds),
      this.pickPriceList(storeId, buyer, variantIds),
      this.loadVolumeRules(storeId, variants),
      this.loadQuantityRules(storeId, variants),
    ]);

    const items: PricedItem[] = input.items.map((item) => {
      const variant = byId.get(item.variantId) as VariantRow;
      const basePrice = Number(variant.price);
      const contract = contracts.get(variant.id) ?? null;
      const explicit = priceList?.prices.get(variant.id) ?? null;
      const list = priceList
        ? {
            id: priceList.id,
            explicitPrice: explicit?.price ?? null,
            adjustmentBps: priceList.adjustmentBps,
          }
        : null;
      const rule = this.pickVolumeRule(
        volumeRules,
        variant,
        priceList?.id ?? null,
        item.quantity,
        basePrice,
        list,
      );
      const resolved = resolvePrice({
        basePrice,
        quantity: item.quantity,
        contract,
        priceList: list,
        volumeRule: rule,
      });
      const quantityRule = checkQuantityRule(
        quantityRules.get(`variant:${variant.id}`) ??
          quantityRules.get(`product:${variant.product.id}`) ??
          null,
        item.quantity,
      );
      return {
        variantId: variant.id,
        productId: variant.product.id,
        quantity: item.quantity,
        visible: visible.has(variant.product.id),
        basePrice: toMoney(basePrice, currency),
        unitPrice: toMoney(resolved.unitPrice, currency),
        lineTotal: toMoney(resolved.unitPrice * item.quantity, currency),
        compareAtPrice:
          resolved.source === "contract"
            ? null
            : (toMoneyOrNull(explicit?.compareAtPrice ?? variant.compareAtPrice, currency) ?? null),
        source: resolved.source,
        priceListId: resolved.priceListId,
        contractPriceId: resolved.contractPriceId,
        volumeRuleId: resolved.volumeRuleId,
        appliedTier: resolved.appliedTier,
        tiers: resolved.tiers.map((t) => ({
          minQuantity: t.minQuantity,
          unitPrice: toMoney(t.unitPrice, currency),
        })),
        quantityRule,
      };
    });

    return {
      currency,
      buyer: {
        ...input.buyer,
        resolvedCompanyId: buyer.companyId,
        resolvedLocationId: buyer.companyLocationId,
      },
      catalogRestricted: access.catalogIds !== null,
      items,
      subtotal: toMoney(
        items.reduce((sum, i) => sum + i.lineTotal.amount, 0),
        currency,
      ),
    };
  }

  // What a company (and its locations) is currently entitled to: shown on the company page.
  async companyOverview(ctx: TenantContext, companyId: string): Promise<CompanyPricingOverview> {
    const storeId = ctx.storeId as string;
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, storeId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundError("Company");
    const [catalogs, priceLists, contractPriceCount] = await Promise.all([
      this.prisma.catalogAssignment.findMany({
        where: { storeId, OR: [{ companyId }, { location: { companyId } }] },
        include: {
          catalog: { select: { id: true, name: true, status: true } },
          location: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.priceListAssignment.findMany({
        where: { storeId, OR: [{ companyId }, { location: { companyId } }] },
        include: {
          priceList: {
            select: { id: true, name: true, status: true, priority: true, adjustmentBps: true },
          },
          location: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.contractPrice.count({ where: { storeId, companyId } }),
    ]);
    return {
      catalogs: catalogs.map((a) => ({
        id: a.catalog.id,
        name: a.catalog.name,
        status: a.catalog.status as CatalogStatus,
        via: a.companyId ? "company" : "location",
        locationName: a.location?.name ?? null,
      })),
      priceLists: priceLists.map((a) => ({
        id: a.priceList.id,
        name: a.priceList.name,
        status: a.priceList.status as PriceListStatus,
        priority: a.priceList.priority,
        adjustmentBps: a.priceList.adjustmentBps,
        via: a.companyId ? "company" : "location",
        locationName: a.location?.name ?? null,
      })),
      contractPriceCount,
    };
  }

  // ---- lookups ----------------------------------------------------------------------------------

  // Location-specific contracts beat company-wide ones; both must be inside their validity window.
  private async loadContracts(storeId: string, buyer: ResolvedTarget, variantIds: string[]) {
    const map = new Map<string, { id: string; price: number; atLocation: boolean }>();
    if (!buyer.companyId) return map;
    const now = new Date();
    const rows = await this.prisma.contractPrice.findMany({
      where: {
        storeId,
        companyId: buyer.companyId,
        variantId: { in: variantIds },
        OR: [
          { companyLocationId: null },
          ...(buyer.companyLocationId ? [{ companyLocationId: buyer.companyLocationId }] : []),
        ],
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validTo: null }, { validTo: { gt: now } }] },
        ],
      },
    });
    for (const row of rows) {
      const atLocation = row.companyLocationId !== null;
      const existing = map.get(row.variantId);
      if (!existing || (atLocation && !existing.atLocation)) {
        map.set(row.variantId, { id: row.id, price: Number(row.price), atLocation });
      }
    }
    return map;
  }

  // One list applies per buyer: highest priority wins, a location assignment beats a company
  // assignment on ties, then the older assignment.
  private async pickPriceList(storeId: string, buyer: ResolvedTarget, variantIds: string[]) {
    if (!buyer.companyId) return null;
    const assignments = await this.prisma.priceListAssignment.findMany({
      where: {
        storeId,
        priceList: { status: "active" },
        OR: [
          { companyId: buyer.companyId },
          ...(buyer.companyLocationId ? [{ companyLocationId: buyer.companyLocationId }] : []),
        ],
      },
      include: { priceList: { select: { id: true, priority: true, adjustmentBps: true } } },
    });
    if (assignments.length === 0) return null;
    assignments.sort((a, b) => {
      if (b.priceList.priority !== a.priceList.priority)
        return b.priceList.priority - a.priceList.priority;
      const aLoc = a.companyLocationId ? 0 : 1;
      const bLoc = b.companyLocationId ? 0 : 1;
      if (aLoc !== bLoc) return aLoc - bLoc;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const chosen = assignments[0]!.priceList;
    const prices = await this.prisma.priceListPrice.findMany({
      where: { priceListId: chosen.id, variantId: { in: variantIds } },
    });
    return {
      id: chosen.id,
      adjustmentBps: chosen.adjustmentBps,
      prices: new Map(
        prices.map((p) => [
          p.variantId,
          {
            price: Number(p.price),
            compareAtPrice: p.compareAtPrice === null ? null : Number(p.compareAtPrice),
          },
        ]),
      ),
    };
  }

  private async loadVolumeRules(storeId: string, variants: VariantRow[]) {
    const variantIds = variants.map((v) => v.id);
    const productIds = [...new Set(variants.map((v) => v.product.id))];
    const collectionIds = [
      ...new Set(variants.flatMap((v) => v.product.collections.map((c) => c.collectionId))),
    ];
    return this.prisma.volumePricingRule.findMany({
      where: {
        storeId,
        isActive: true,
        OR: [
          { scope: "store" },
          { scope: "variant", scopeId: { in: variantIds } },
          { scope: "product", scopeId: { in: productIds } },
          ...(collectionIds.length
            ? [{ scope: "collection" as const, scopeId: { in: collectionIds } }]
            : []),
        ],
      },
    });
  }

  // Most specific scope wins; among rules at the same scope the one yielding the lowest unit
  // price for this quantity wins. Rules bound to a price list only count when that list applies.
  private pickVolumeRule(
    rules: Awaited<ReturnType<PricingService["loadVolumeRules"]>>,
    variant: VariantRow,
    priceListId: string | null,
    quantity: number,
    basePrice: number,
    list: { explicitPrice: number | null; adjustmentBps: number } | null,
  ) {
    const collections = new Set(variant.product.collections.map((c) => c.collectionId));
    const candidates = rules.filter((r) => {
      if (r.priceListId && r.priceListId !== priceListId) return false;
      switch (r.scope) {
        case "variant":
          return r.scopeId === variant.id;
        case "product":
          return r.scopeId === variant.product.id;
        case "collection":
          return r.scopeId !== null && collections.has(r.scopeId);
        default:
          return true;
      }
    });
    if (candidates.length === 0) return null;
    const basis = list
      ? (list.explicitPrice ??
        Math.max(0, Math.round((basePrice * (10_000 + list.adjustmentBps)) / 10_000)))
      : basePrice;
    const priced = candidates.map((r) => {
      const tiers = r.tiers as unknown as VolumeTier[];
      const tier = selectTier(tiers, quantity);
      return {
        rule: { id: r.id, tierType: r.tierType as VolumeTierType, tiers },
        rank: SCOPE_RANK[r.scope],
        unit: tier ? tierUnitPrice(r.tierType as VolumeTierType, tier, basis) : basis,
      };
    });
    priced.sort((a, b) => a.rank - b.rank || a.unit - b.unit);
    return priced[0]!.rule;
  }

  private async loadQuantityRules(storeId: string, variants: VariantRow[]) {
    const rows = await this.prisma.quantityRule.findMany({
      where: {
        storeId,
        OR: [
          { scope: "variant", scopeId: { in: variants.map((v) => v.id) } },
          { scope: "product", scopeId: { in: [...new Set(variants.map((v) => v.product.id))] } },
        ],
      },
    });
    return new Map(rows.map((r) => [`${r.scope}:${r.scopeId}`, r]));
  }
}
