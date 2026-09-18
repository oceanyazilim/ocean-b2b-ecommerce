import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CancelFulfillmentInput,
  CreateFulfillmentInput,
  FulfillmentSummary,
  UpdateFulfillmentTrackingInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";

const include = {
  location: { select: { id: true, name: true } },
  items: { include: { orderItem: { select: { title: true, sku: true } } } },
} satisfies Prisma.FulfillmentInclude;
type FulfillmentRow = Prisma.FulfillmentGetPayload<{ include: typeof include }>;

// Fulfilling an order turns a reservation (spec: inventory "reserved" bucket) into an actual
// outbound movement: on-hand and reserved both drop at the fulfilment's location. Cancelling a
// fulfilment reverses that. Digital/service lines (requiresShipping = false) never block or
// need a fulfilment.
@Injectable()
export class FulfillmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly reservations: InventoryReservationsService,
  ) {}

  private orderScope(ctx: TenantContext): Prisma.OrderWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  toSummary(row: FulfillmentRow): FulfillmentSummary {
    return {
      id: row.id,
      status: row.status,
      location: row.location,
      trackingCarrier: row.trackingCarrier,
      trackingNumber: row.trackingNumber,
      trackingUrl: row.trackingUrl,
      note: row.note,
      items: row.items.map((i) => ({
        orderItemId: i.orderItemId,
        title: i.orderItem.title,
        sku: i.orderItem.sku,
        quantity: i.quantity,
      })),
      shippedAt: row.shippedAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(ctx: TenantContext, orderId: string): Promise<FulfillmentSummary[]> {
    await this.requireOrder(ctx, orderId);
    const rows = await this.prisma.fulfillment.findMany({
      where: { orderId },
      include,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  private async requireOrder(ctx: TenantContext, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { ...this.orderScope(ctx), id: orderId } });
    if (!order) throw new NotFoundError("Order");
    return order;
  }

  async create(
    ctx: TenantContext,
    orderId: string,
    input: CreateFulfillmentInput,
    meta: RequestMeta,
  ): Promise<FulfillmentSummary> {
    const storeId = ctx.storeId as string;
    const fulfillmentId = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { ...this.orderScope(ctx), id: orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundError("Order");
      if (order.status === "cancelled") throw new ConflictError("This order is cancelled.");

      const location = input.locationId
        ? await tx.location.findFirst({ where: { id: input.locationId, storeId, isActive: true } })
        : await tx.location.findFirst({ where: { storeId, isActive: true, isDefault: true } });
      if (!location) {
        throw new ValidationError("Pick an active location to fulfil from.", [
          { path: "locationId", message: "Unknown or inactive location" },
        ]);
      }

      const itemsById = new Map(order.items.map((i) => [i.id, i]));
      for (const line of input.items) {
        const item = itemsById.get(line.orderItemId);
        if (!item || item.orderId !== orderId) {
          throw new ValidationError("Unknown order item.", [
            { path: `items.${line.orderItemId}`, message: "Not on this order" },
          ]);
        }
        const remaining = item.quantity - item.fulfilledQuantity;
        if (line.quantity > remaining) {
          throw new ValidationError(`Only ${remaining} left to fulfil for ${item.title}.`, [
            { path: `items.${line.orderItemId}`, message: "Exceeds remaining quantity" },
          ]);
        }
      }

      const fulfillment = await tx.fulfillment.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          orderId,
          locationId: location.id,
          status: input.trackingNumber ? "shipped" : "pending",
          trackingCarrier: input.trackingCarrier ?? null,
          trackingNumber: input.trackingNumber ?? null,
          trackingUrl: input.trackingUrl ?? null,
          note: input.note ?? null,
          shippedAt: input.trackingNumber ? new Date() : null,
          createdById: ctx.actor.id,
        },
      });

      const consumedByInventoryItem = new Map<string, number>();
      for (const line of input.items) {
        const item = itemsById.get(line.orderItemId)!;
        await tx.fulfillmentItem.create({
          data: { fulfillmentId: fulfillment.id, orderItemId: item.id, quantity: line.quantity },
        });
        await tx.orderItem.update({
          where: { id: item.id },
          data: { fulfilledQuantity: { increment: line.quantity } },
        });

        const reservations = await tx.orderItemReservation.findMany({
          where: { orderItemId: item.id, locationId: location.id, releasedAt: null },
          orderBy: { createdAt: "asc" },
        });
        const available = reservations.reduce((sum, r) => sum + r.quantity, 0);
        if (available < line.quantity) {
          throw new ValidationError(
            `Only ${available} units are reserved at ${location.name} for ${item.title}. Fulfil from a different location or in smaller batches.`,
            [{ path: `items.${line.orderItemId}`, message: "Not reserved here" }],
          );
        }
        let remaining = line.quantity;
        for (const r of reservations) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, r.quantity);
          if (take === r.quantity) {
            await tx.orderItemReservation.update({ where: { id: r.id }, data: { releasedAt: new Date() } });
          } else {
            await tx.orderItemReservation.update({
              where: { id: r.id },
              data: { quantity: { decrement: take } },
            });
          }
          remaining -= take;
          consumedByInventoryItem.set(
            r.inventoryItemId,
            (consumedByInventoryItem.get(r.inventoryItemId) ?? 0) + take,
          );
        }
      }

      for (const [inventoryItemId, quantity] of consumedByInventoryItem) {
        await tx.inventoryLevel.updateMany({
          where: { itemId: inventoryItemId, locationId: location.id },
          data: { quantity: { decrement: quantity }, reserved: { decrement: quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            storeId,
            organizationId: ctx.organizationId,
            itemId: inventoryItemId,
            fromLocationId: location.id,
            toLocationId: null,
            quantity,
            reason: "fulfillment",
            source: "system",
            reference: fulfillment.id,
            createdById: ctx.actor.id,
          },
        });
        const agg = await tx.inventoryLevel.aggregate({
          where: { itemId: inventoryItemId },
          _sum: { quantity: true, reserved: true, damaged: true },
        });
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: {
            onHand: agg._sum.quantity ?? 0,
            reserved: Math.max(0, agg._sum.reserved ?? 0),
            damaged: agg._sum.damaged ?? 0,
            lastMovedAt: new Date(),
          },
        });
      }

      await this.recomputeFulfillmentStatus(orderId, tx);
      await tx.orderEvent.create({
        data: {
          orderId,
          storeId,
          type: "fulfillment.created",
          payload: { fulfillmentId: fulfillment.id, itemCount: input.items.length },
          actorType: ctx.actor.type,
          actorId: ctx.actor.id,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "fulfillment.created",
          resourceType: "fulfillment",
          resourceId: fulfillment.id,
          after: { orderId, locationId: location.id, itemCount: input.items.length },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "fulfillment.created", { orderId, fulfillmentId: fulfillment.id }, tx);
      return fulfillment.id;
    });
    return this.get(ctx, orderId, fulfillmentId);
  }

  private async recomputeFulfillmentStatus(orderId: string, tx: Prisma.TransactionClient) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { quantity: true, fulfilledQuantity: true, requiresShipping: true },
    });
    const shippable = items.filter((i) => i.requiresShipping);
    const status =
      shippable.length === 0 || shippable.every((i) => i.fulfilledQuantity === 0)
        ? "unfulfilled"
        : shippable.every((i) => i.fulfilledQuantity >= i.quantity)
          ? "fulfilled"
          : "partially_fulfilled";
    await tx.order.update({ where: { id: orderId }, data: { fulfillmentStatus: status } });
  }

  async get(ctx: TenantContext, orderId: string, id: string): Promise<FulfillmentSummary> {
    await this.requireOrder(ctx, orderId);
    const row = await this.prisma.fulfillment.findFirst({ where: { id, orderId }, include });
    if (!row) throw new NotFoundError("Fulfillment");
    return this.toSummary(row);
  }

  async updateTracking(
    ctx: TenantContext,
    orderId: string,
    id: string,
    input: UpdateFulfillmentTrackingInput,
    meta: RequestMeta,
  ): Promise<FulfillmentSummary> {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.fulfillment.findFirst({ where: { id, orderId } });
    if (!current) throw new NotFoundError("Fulfillment");
    if (current.status === "cancelled") throw new ConflictError("This fulfillment is cancelled.");
    const wasShipped = current.status === "shipped" || current.status === "delivered";
    const nowShipping = input.trackingNumber !== undefined ? !!input.trackingNumber : wasShipped;
    await this.prisma.fulfillment.update({
      where: { id },
      data: {
        trackingCarrier: input.trackingCarrier ?? current.trackingCarrier,
        trackingNumber: input.trackingNumber ?? current.trackingNumber,
        trackingUrl: input.trackingUrl ?? current.trackingUrl,
        ...(current.status === "pending" && nowShipping ? { status: "shipped", shippedAt: new Date() } : {}),
      },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "fulfillment.tracking_updated",
      resourceType: "fulfillment",
      resourceId: id,
      after: input,
      meta,
    });
    return this.get(ctx, orderId, id);
  }

  async markShipped(ctx: TenantContext, orderId: string, id: string, meta: RequestMeta) {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.fulfillment.findFirst({ where: { id, orderId } });
    if (!current) throw new NotFoundError("Fulfillment");
    if (current.status !== "pending") throw new ConflictError("This fulfillment is not pending.");
    await this.prisma.fulfillment.update({
      where: { id },
      data: { status: "shipped", shippedAt: new Date() },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "fulfillment.shipped",
      resourceType: "fulfillment",
      resourceId: id,
      meta,
    });
    return this.get(ctx, orderId, id);
  }

  async markDelivered(ctx: TenantContext, orderId: string, id: string, meta: RequestMeta) {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.fulfillment.findFirst({ where: { id, orderId } });
    if (!current) throw new NotFoundError("Fulfillment");
    if (current.status !== "shipped") throw new ConflictError("This fulfillment has not shipped yet.");
    await this.prisma.fulfillment.update({
      where: { id },
      data: { status: "delivered", deliveredAt: new Date() },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "fulfillment.delivered",
      resourceType: "fulfillment",
      resourceId: id,
      meta,
    });
    return this.get(ctx, orderId, id);
  }

  async cancel(
    ctx: TenantContext,
    orderId: string,
    id: string,
    input: CancelFulfillmentInput,
    meta: RequestMeta,
  ) {
    const storeId = ctx.storeId as string;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { ...this.orderScope(ctx), id: orderId } });
      if (!order) throw new NotFoundError("Order");
      const current = await tx.fulfillment.findFirst({
        where: { id, orderId },
        include: { items: true },
      });
      if (!current) throw new NotFoundError("Fulfillment");
      if (current.status === "cancelled" || current.status === "delivered") {
        throw new ConflictError("Only a pending or shipped fulfillment can be cancelled.");
      }
      for (const item of current.items) {
        await tx.orderItem.update({
          where: { id: item.orderItemId },
          data: { fulfilledQuantity: { decrement: item.quantity } },
        });
      }
      if (input.restock && current.locationId) {
        const orderItems = await tx.orderItem.findMany({
          where: { id: { in: current.items.map((i) => i.orderItemId) } },
          select: { id: true, variantId: true },
        });
        const variantByItem = new Map(orderItems.map((i) => [i.id, i.variantId]));
        for (const line of current.items) {
          const variantId = variantByItem.get(line.orderItemId);
          if (!variantId) continue;
          // The order is still open and still owes these units, so restore the reservation
          // rather than freeing the stock for another order (see restoreFulfillmentReservation).
          await this.reservations.restoreFulfillmentReservation(ctx, tx, {
            orderItemId: line.orderItemId,
            variantId,
            locationId: current.locationId,
            quantity: line.quantity,
            reference: current.id,
          });
        }
      }
      await tx.fulfillment.update({
        where: { id },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      await this.recomputeFulfillmentStatus(orderId, tx);
      await tx.orderEvent.create({
        data: {
          orderId,
          storeId,
          type: "fulfillment.cancelled",
          payload: { fulfillmentId: id, restock: input.restock },
          actorType: ctx.actor.type,
          actorId: ctx.actor.id,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "fulfillment.cancelled",
          resourceType: "fulfillment",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "fulfillment.cancelled", { orderId, fulfillmentId: id }, tx);
    });
    return this.get(ctx, orderId, id);
  }
}
