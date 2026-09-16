import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { Address, OrderSource } from "@ocean/types";

import { ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { LineQuoterService, type QuoteLineInput, type ResolvedBuyer } from "./line-quoter.service";

export interface PlaceOrderParams {
  buyer: ResolvedBuyer;
  lines: QuoteLineInput[];
  email: string | null;
  poNumber: string | null;
  note: string | null;
  tags?: string[];
  shippingAddress: Address | null;
  billingAddress: Address | null;
  source: OrderSource;
  cartId?: string | null;
  draftOrderId?: string | null;
}

const json = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

// The checkout engine's last mile (spec §79): re-quote, refuse anything not sellable, reserve
// stock, then write the immutable order inside one transaction and emit exactly one event.
@Injectable()
export class OrderPlacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoter: LineQuoterService,
    private readonly reservations: InventoryReservationsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async place(ctx: TenantContext, params: PlaceOrderParams, meta: RequestMeta): Promise<string> {
    if (params.lines.length === 0) {
      throw new ValidationError("Add at least one item before placing the order.", [
        { path: "items", message: "Empty" },
      ]);
    }
    const quote = await this.quoter.quote(ctx, params.buyer, params.lines, {
      shippingAddress: params.shippingAddress,
      billingAddress: params.billingAddress,
    });
    if (!quote.ready) {
      throw new ValidationError(quote.problems[0] ?? "The order cannot be placed.", [
        ...quote.lines.flatMap((l) =>
          l.problems.map((p) => ({ path: `items.${l.variantId}`, message: p })),
        ),
      ]);
    }

    const storeId = ctx.storeId as string;
    return this.prisma.$transaction(async (tx) => {
      const reserved = await this.reservations.reserve(
        ctx,
        quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        tx,
      );
      const store = await tx.store.update({
        where: { id: storeId },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });
      const number = store.orderSequence;
      const order = await tx.order.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          number,
          name: `#${number}`,
          status: "confirmed",
          paymentStatus: "pending",
          fulfillmentStatus: "unfulfilled",
          source: params.source,
          customerId: params.buyer.customerId,
          companyId: params.buyer.companyId,
          companyLocationId: params.buyer.companyLocationId,
          email: params.email ?? params.buyer.summary.customer?.email ?? null,
          currency: quote.currency,
          poNumber: params.poNumber,
          note: params.note,
          tags: params.tags ?? [],
          itemCount: quote.totals.itemCount,
          subtotal: BigInt(quote.totals.subtotal.amount),
          discountTotal: BigInt(quote.totals.discountTotal.amount),
          shippingTotal: BigInt(quote.totals.shippingTotal.amount),
          taxTotal: BigInt(quote.totals.taxTotal.amount),
          total: BigInt(quote.totals.total.amount),
          shippingAddress: json(params.shippingAddress),
          billingAddress: json(params.billingAddress),
          cartId: params.cartId ?? null,
          draftOrderId: params.draftOrderId ?? null,
          placedById: ctx.actor.type === "user" ? ctx.actor.id : null,
        },
      });
      for (const [position, line] of quote.lines.entries()) {
        const variant = quote.variants.get(line.variantId)!;
        const item = await tx.orderItem.create({
          data: {
            orderId: order.id,
            storeId,
            variantId: variant.id,
            productId: variant.product.id,
            title: line.title,
            variantTitle: line.variantTitle,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: BigInt(line.unitPrice.amount),
            compareAtPrice: line.compareAtPrice ? BigInt(line.compareAtPrice.amount) : null,
            priceSource: line.priceSource,
            tax: BigInt(quote.taxPerLine[position] ?? 0),
            lineTotal: BigInt(line.lineTotal.amount),
            requiresShipping: variant.requiresShipping,
            taxable: variant.taxable,
            position,
          },
        });
        const holds = reserved.get(line.variantId) ?? [];
        if (holds.length) {
          await tx.orderItemReservation.createMany({
            data: holds.map((h) => ({
              orderItemId: item.id,
              storeId,
              inventoryItemId: h.inventoryItemId,
              locationId: h.locationId,
              quantity: h.quantity,
            })),
          });
        }
      }
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          storeId,
          type: "order.created",
          payload: {
            source: params.source,
            total: quote.totals.total.amount,
            itemCount: quote.totals.itemCount,
          },
          actorType: ctx.actor.type,
          actorId: ctx.actor.id,
        },
      });
      if (params.buyer.customerId) {
        await tx.customer.update({
          where: { id: params.buyer.customerId },
          data: {
            ordersCount: { increment: 1 },
            totalSpent: { increment: BigInt(quote.totals.total.amount) },
            lastOrderAt: new Date(),
          },
        });
      }
      if (params.cartId) {
        await tx.cart.update({
          where: { id: params.cartId },
          data: { status: "completed", completedOrderId: order.id },
        });
      }
      if (params.draftOrderId) {
        await tx.draftOrder.update({
          where: { id: params.draftOrderId },
          data: { status: "completed", completedOrderId: order.id, version: { increment: 1 } },
        });
      }
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "order.created",
          resourceType: "order",
          resourceId: order.id,
          after: {
            name: order.name,
            total: quote.totals.total.amount,
            currency: quote.currency,
            source: params.source,
          },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "order.created",
        { orderId: order.id, number, total: quote.totals.total.amount, currency: quote.currency },
        tx,
      );
      return order.id;
    });
  }
}
