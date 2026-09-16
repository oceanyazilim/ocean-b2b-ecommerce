import type { Prisma } from "@ocean/db";
import type {
  Address,
  BuyerSummary,
  FulfillmentStatus,
  OrderDetail,
  OrderEventEntry,
  OrderSource,
  OrderStatus,
  OrderSummary,
  PaymentStatus,
  PriceSourceKind,
} from "@ocean/types";

import type { StorageAdapter } from "../../infrastructure/storage/storage.types";
import { toMoney, toMoneyOrNull } from "../catalog/money";
import { customerDisplayName } from "../customers/customer.mapper";

export const buyerInclude = {
  customer: { select: { id: true, email: true, firstName: true, lastName: true } },
  company: { select: { id: true, displayName: true } },
  location: { select: { id: true, name: true } },
} as const;

type BuyerRow = {
  customer: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
  company: { id: string; displayName: string } | null;
  location: { id: string; name: string } | null;
};

export function toBuyerSummary(row: BuyerRow): BuyerSummary {
  return {
    customer: row.customer
      ? {
          id: row.customer.id,
          email: row.customer.email,
          displayName: customerDisplayName(row.customer),
        }
      : null,
    company: row.company,
    location: row.location,
  };
}

export const orderSummaryInclude = { ...buyerInclude } satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...buyerInclude,
  placedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { position: "asc" as const },
    include: {
      reservations: {
        where: { releasedAt: null },
        include: { location: { select: { id: true, name: true } } },
      },
      variant: {
        select: {
          product: {
            select: {
              media: {
                orderBy: { position: "asc" as const },
                take: 1,
                include: { media: { select: { storageKey: true, alt: true, deletedAt: true } } },
              },
            },
          },
        },
      },
    },
  },
  events: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

export type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof orderSummaryInclude }>;
export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export function toOrderSummary(row: OrderSummaryRow): OrderSummary {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    status: row.status as OrderStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    fulfillmentStatus: row.fulfillmentStatus as FulfillmentStatus,
    source: row.source as OrderSource,
    buyer: toBuyerSummary(row),
    email: row.email,
    currency: row.currency,
    poNumber: row.poNumber,
    tags: row.tags,
    itemCount: row.itemCount,
    total: toMoney(row.total, row.currency),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toOrderDetail(
  row: OrderDetailRow,
  actors: Map<string, { id: string; name: string }>,
  storage: StorageAdapter,
): OrderDetail {
  const c = row.currency;
  return {
    ...toOrderSummary(row),
    note: row.note,
    totals: {
      subtotal: toMoney(row.subtotal, c),
      discountTotal: toMoney(row.discountTotal, c),
      shippingTotal: toMoney(row.shippingTotal, c),
      taxTotal: toMoney(row.taxTotal, c),
      total: toMoney(row.total, c),
      itemCount: row.itemCount,
    },
    shippingAddress: (row.shippingAddress as unknown as Address | null) ?? null,
    billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
    items: row.items.map((i) => {
      const first = i.variant?.product.media.find((m) => !m.media.deletedAt);
      return {
        id: i.id,
        variantId: i.variantId,
        productId: i.productId,
        title: i.title,
        variantTitle: i.variantTitle,
        sku: i.sku,
        image: first
          ? { url: storage.publicUrl(first.media.storageKey), alt: first.media.alt }
          : null,
        quantity: i.quantity,
        unitPrice: toMoney(i.unitPrice, c),
        compareAtPrice: toMoneyOrNull(i.compareAtPrice, c),
        priceSource: i.priceSource as PriceSourceKind,
        discount: toMoney(i.discount, c),
        tax: toMoney(i.tax, c),
        lineTotal: toMoney(i.lineTotal, c),
        requiresShipping: i.requiresShipping,
        fulfilledQuantity: i.fulfilledQuantity,
        refundedQuantity: i.refundedQuantity,
        reservations: i.reservations.map((r) => ({
          locationId: r.location.id,
          locationName: r.location.name,
          quantity: r.quantity,
        })),
      };
    }),
    events: row.events.map((e): OrderEventEntry => ({
      id: e.id,
      type: e.type,
      payload: (e.payload as Record<string, unknown>) ?? {},
      actor: e.actorId ? (actors.get(e.actorId) ?? null) : null,
      actorType: e.actorType,
      createdAt: e.createdAt.toISOString(),
    })),
    placedBy: row.placedBy,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    draftOrderId: row.draftOrderId,
    version: row.version,
  };
}
