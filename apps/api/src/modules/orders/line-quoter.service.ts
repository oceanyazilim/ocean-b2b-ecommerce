import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  Address,
  BuyerInput,
  BuyerSummary,
  OrderTotals,
  PriceSourceKind,
  QuotedLine,
} from "@ocean/types";

import { ValidationError } from "../../common/errors/domain-error";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { toMoney, toMoneyOrNull } from "../catalog/money";
import { AssignmentTargetsService } from "../catalogs/assignment-targets.service";
import { customerDisplayName } from "../customers/customer.mapper";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { PricingService } from "../pricing/pricing.service";
import {
  SHIPPING_CALCULATOR,
  TAX_CALCULATOR,
  type ShippingCalculator,
  type TaxCalculator,
} from "./calculators";

export interface QuoteLineInput {
  variantId: string;
  quantity: number;
  // Merchant override (draft orders). Marks the line as "custom" priced.
  customUnitPrice?: number | null;
}

export interface ResolvedBuyer {
  customerId: string | null;
  companyId: string | null;
  companyLocationId: string | null;
  summary: BuyerSummary;
}

export interface LineQuote {
  currency: string;
  buyer: ResolvedBuyer;
  catalogRestricted: boolean;
  lines: QuotedLine[];
  totals: OrderTotals;
  problems: string[];
  ready: boolean;
  // Raw data placement needs to snapshot without another round-trip.
  variants: Map<string, VariantRow>;
  taxPerLine: number[];
  shippableWeightGrams: number;
}

const GRAMS_PER_UNIT: Record<string, number> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };
const toGrams = (weight: unknown, unit: string): number =>
  weight === null || weight === undefined
    ? 0
    : Math.round(Number(weight) * (GRAMS_PER_UNIT[unit] ?? 1));

const variantInclude = {
  product: {
    select: {
      id: true,
      title: true,
      status: true,
      deletedAt: true,
      taxClassId: true,
      media: {
        orderBy: { position: "asc" as const },
        take: 1,
        include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
      },
    },
  },
} satisfies Prisma.ProductVariantInclude;
export type VariantRow = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

// One quoting path for carts, draft orders and checkout: resolves the buyer, prices every
// line through PricingService, checks catalog visibility, quantity rules and stock, then
// runs the shipping and tax calculators. Nothing client-supplied survives except quantities
// and explicit merchant overrides.
@Injectable()
export class LineQuoterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AssignmentTargetsService,
    private readonly pricing: PricingService,
    private readonly reservations: InventoryReservationsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
    @Inject(SHIPPING_CALCULATOR) private readonly shipping: ShippingCalculator,
    @Inject(TAX_CALCULATOR) private readonly tax: TaxCalculator,
  ) {}

  async resolveBuyer(ctx: TenantContext, buyer: BuyerInput): Promise<ResolvedBuyer> {
    const storeId = ctx.storeId as string;
    const target = await this.targets.resolveBuyer(ctx, {
      companyId: buyer.companyId ?? undefined,
      companyLocationId: buyer.companyLocationId ?? undefined,
    });
    let customer: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    } | null = null;
    if (buyer.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: buyer.customerId, storeId, deletedAt: null },
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (!customer) {
        throw new ValidationError("That customer is not in this store.", [
          { path: "buyer.customerId", message: "Unknown customer" },
        ]);
      }
      if (target.companyId) {
        const membership = await this.prisma.companyUser.findFirst({
          where: { companyId: target.companyId, customerId: customer.id, status: "active" },
          select: { id: true },
        });
        if (!membership) {
          throw new ValidationError("This customer is not a member of the company.", [
            { path: "buyer.customerId", message: "Not a company member" },
          ]);
        }
      }
    }
    const [company, location] = await Promise.all([
      target.companyId
        ? this.prisma.company.findUnique({
            where: { id: target.companyId },
            select: { id: true, displayName: true, status: true },
          })
        : null,
      target.companyLocationId
        ? this.prisma.companyLocation.findUnique({
            where: { id: target.companyLocationId },
            select: { id: true, name: true, isActive: true },
          })
        : null,
    ]);
    if (company && company.status !== "active") {
      throw new ValidationError(`The company is ${company.status} and cannot place orders.`, [
        { path: "buyer.companyId", message: `Company ${company.status}` },
      ]);
    }
    if (location && !location.isActive) {
      throw new ValidationError("That company location is inactive.", [
        { path: "buyer.companyLocationId", message: "Inactive location" },
      ]);
    }
    return {
      customerId: customer?.id ?? null,
      companyId: target.companyId,
      companyLocationId: target.companyLocationId,
      summary: {
        customer: customer
          ? { id: customer.id, email: customer.email, displayName: customerDisplayName(customer) }
          : null,
        company: company ? { id: company.id, displayName: company.displayName } : null,
        location: location ? { id: location.id, name: location.name } : null,
      },
    };
  }

  async quote(
    ctx: TenantContext,
    buyer: ResolvedBuyer,
    inputLines: readonly QuoteLineInput[],
    options: {
      shippingAddress: Address | null;
      billingAddress: Address | null;
      shippingRateId?: string | null;
    },
  ): Promise<LineQuote> {
    const storeId = ctx.storeId as string;
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { defaultCurrency: true, pricesIncludeTax: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";
    const pricesIncludeTax = store?.pricesIncludeTax ?? false;

    // Merge duplicate variants so pricing sees the real quantity.
    const merged = new Map<string, QuoteLineInput>();
    for (const line of inputLines) {
      const prev = merged.get(line.variantId);
      merged.set(
        line.variantId,
        prev
          ? { ...prev, quantity: prev.quantity + line.quantity }
          : { ...line, customUnitPrice: line.customUnitPrice ?? null },
      );
    }
    const lines = [...merged.values()];
    const variantIds = lines.map((l) => l.variantId);

    const rows = await this.prisma.productVariant.findMany({
      where: { storeId, id: { in: variantIds } },
      include: variantInclude,
    });
    const variants = new Map(rows.map((v) => [v.id, v]));
    const missing = variantIds.filter((id) => !variants.has(id));
    if (missing.length) {
      throw new ValidationError("One or more items no longer exist.", [
        { path: `items.${missing[0]}`, message: "Unknown variant" },
      ]);
    }

    const [priced, availability] = await Promise.all([
      lines.length
        ? this.pricing.quote(ctx, {
            buyer: {
              ...(buyer.companyId ? { companyId: buyer.companyId } : {}),
              ...(buyer.companyLocationId ? { companyLocationId: buyer.companyLocationId } : {}),
            },
            items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          })
        : null,
      this.reservations.availability(ctx, variantIds),
    ]);
    const pricedByVariant = new Map((priced?.items ?? []).map((i) => [i.variantId, i]));

    const quoted: QuotedLine[] = lines.map((line) => {
      const variant = variants.get(line.variantId)!;
      const item = pricedByVariant.get(line.variantId)!;
      const problems: string[] = [];
      const sellable =
        !variant.deletedAt && !variant.product.deletedAt && variant.product.status === "active";
      if (!sellable) problems.push("This product is not available for sale.");
      else if (!item.visible) problems.push("This product is not in the buyer's catalog.");
      if (!item.quantityRule.ok && item.quantityRule.message) {
        problems.push(
          item.quantityRule.suggestedQuantity !== null
            ? `${item.quantityRule.message} Try ${item.quantityRule.suggestedQuantity}.`
            : item.quantityRule.message,
        );
      }
      const available = availability.get(line.variantId) ?? null;
      if (available !== null && available < line.quantity) {
        problems.push(
          available === 0 ? "Out of stock." : `Only ${available} available at the moment.`,
        );
      }
      const custom = line.customUnitPrice ?? null;
      const unit = custom ?? item.unitPrice.amount;
      const priceSource: PriceSourceKind = custom !== null ? "custom" : item.source;
      const first = variant.product.media.find((m) => !m.media.deletedAt);
      return {
        variantId: variant.id,
        productId: variant.product.id,
        title: variant.product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        image: first
          ? { url: this.storage.publicUrl(first.media.storageKey), alt: first.media.alt }
          : null,
        quantity: line.quantity,
        unitPrice: toMoney(unit, currency),
        basePrice: item.basePrice,
        compareAtPrice: custom !== null ? null : item.compareAtPrice,
        lineTotal: toMoney(unit * line.quantity, currency),
        priceSource,
        visible: item.visible,
        available,
        tiers: item.tiers,
        quantityRule: item.quantityRule,
        problems,
      };
    });

    const subtotal = quoted.reduce((sum, l) => sum + l.lineTotal.amount, 0);
    const calcInput = {
      storeId,
      currency,
      companyId: buyer.companyId,
      companyLocationId: buyer.companyLocationId,
      customerId: buyer.customerId,
      shippingAddress: options.shippingAddress,
      billingAddress: options.billingAddress,
      selectedShippingRateId: options.shippingRateId ?? null,
      lines: quoted.map((l) => {
        const v = variants.get(l.variantId)!;
        return {
          variantId: l.variantId,
          productId: l.productId,
          quantity: l.quantity,
          lineTotal: l.lineTotal.amount,
          requiresShipping: v.requiresShipping,
          taxable: v.taxable,
          taxClassId: v.product.taxClassId,
          weightGrams: toGrams(v.weight, v.weightUnit) * l.quantity,
        };
      }),
      subtotal,
    };
    const shippableWeightGrams = calcInput.lines
      .filter((l) => l.requiresShipping)
      .reduce((sum, l) => sum + l.weightGrams, 0);
    const [shippingTotal, taxes] = await Promise.all([
      quoted.some((l) => variants.get(l.variantId)!.requiresShipping)
        ? this.shipping.shippingTotal(calcInput)
        : Promise.resolve(0),
      this.tax.taxes(calcInput),
    ]);
    const problems = quoted.flatMap((l) => l.problems.map((p) => `${l.title}: ${p}`));
    // Inclusive pricing: taxTotal is already inside subtotal (informational only), so it is
    // not added again. Exclusive: taxTotal is added on top, same as shipping.
    const total = pricesIncludeTax
      ? subtotal + shippingTotal
      : subtotal + shippingTotal + taxes.total;
    return {
      currency,
      buyer,
      catalogRestricted: priced?.catalogRestricted ?? false,
      lines: quoted,
      totals: {
        subtotal: toMoney(subtotal, currency),
        discountTotal: toMoney(0, currency),
        shippingTotal: toMoney(shippingTotal, currency),
        taxTotal: toMoney(taxes.total, currency),
        total: toMoney(total, currency),
        itemCount: quoted.reduce((sum, l) => sum + l.quantity, 0),
      },
      problems,
      ready: quoted.length > 0 && problems.length === 0,
      variants,
      taxPerLine: taxes.perLine,
      shippableWeightGrams,
    };
  }
}

export const nullMoney = (currency: string) => toMoneyOrNull(null, currency);
