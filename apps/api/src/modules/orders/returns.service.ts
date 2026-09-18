import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CloseReturnInput,
  CreateReturnInput,
  DeclineReturnInput,
  ReceiveReturnInput,
  ReturnSummary,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { PaymentsService } from "../payments/payments.service";

const include = {
  items: { include: { orderItem: { select: { title: true, sku: true } } } },
} satisfies Prisma.ReturnInclude;
type ReturnRow = Prisma.ReturnGetPayload<{ include: typeof include }>;

// A return is requested against delivered/fulfilled units, approved by staff, received back
// into stock, then closed — closing with resolution "refund" hands off to PaymentsService so
// the money and the stock move as one auditable trail.
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly payments: PaymentsService,
    private readonly reservations: InventoryReservationsService,
  ) {}

  private orderScope(ctx: TenantContext): Prisma.OrderWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  toSummary(row: ReturnRow): ReturnSummary {
    return {
      id: row.id,
      status: row.status,
      reason: row.reason,
      resolution: row.resolution,
      note: row.note,
      refundId: row.refundId,
      items: row.items.map((i) => ({
        orderItemId: i.orderItemId,
        title: i.orderItem.title,
        sku: i.orderItem.sku,
        quantity: i.quantity,
        condition: i.condition,
        restock: i.restock,
      })),
      receivedAt: row.receivedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async requireOrder(ctx: TenantContext, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { ...this.orderScope(ctx), id: orderId } });
    if (!order) throw new NotFoundError("Order");
    return order;
  }

  async list(ctx: TenantContext, orderId: string): Promise<ReturnSummary[]> {
    await this.requireOrder(ctx, orderId);
    const rows = await this.prisma.return.findMany({
      where: { orderId },
      include,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, orderId: string, id: string): Promise<ReturnSummary> {
    await this.requireOrder(ctx, orderId);
    const row = await this.prisma.return.findFirst({ where: { id, orderId }, include });
    if (!row) throw new NotFoundError("Return");
    return this.toSummary(row);
  }

  async create(
    ctx: TenantContext,
    orderId: string,
    input: CreateReturnInput,
    meta: RequestMeta,
  ): Promise<ReturnSummary> {
    const storeId = ctx.storeId as string;
    const order = await this.prisma.order.findFirst({
      where: { ...this.orderScope(ctx), id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundError("Order");
    const itemsById = new Map(order.items.map((i) => [i.id, i]));
    for (const line of input.items) {
      const item = itemsById.get(line.orderItemId);
      if (!item) {
        throw new ValidationError("Unknown order item.", [
          { path: `items.${line.orderItemId}`, message: "Not on this order" },
        ]);
      }
      const remaining = item.quantity - item.refundedQuantity;
      if (line.quantity > remaining) {
        throw new ValidationError(`Only ${remaining} units of ${item.title} can still be returned.`, [
          { path: `items.${line.orderItemId}`, message: "Exceeds remaining quantity" },
        ]);
      }
    }
    const created = await this.prisma.return.create({
      data: {
        storeId,
        organizationId: ctx.organizationId,
        orderId,
        reason: input.reason,
        resolution: input.resolution,
        note: input.note ?? null,
        createdById: ctx.actor.id,
        items: {
          create: input.items.map((i) => ({
            orderItemId: i.orderItemId,
            quantity: i.quantity,
            condition: i.condition ?? null,
            restock: i.restock,
          })),
        },
      },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId,
      actorId: ctx.actor.id,
      action: "return.requested",
      resourceType: "return",
      resourceId: created.id,
      after: { orderId, reason: input.reason, resolution: input.resolution },
      meta,
    });
    await this.events.publish(ctx, "return.requested", { orderId, returnId: created.id });
    return this.get(ctx, orderId, created.id);
  }

  async approve(ctx: TenantContext, orderId: string, id: string, meta: RequestMeta) {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.return.findFirst({ where: { id, orderId } });
    if (!current) throw new NotFoundError("Return");
    if (current.status !== "requested") throw new ConflictError("Only a requested return can be approved.");
    await this.prisma.return.update({ where: { id }, data: { status: "approved" } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "return.approved",
      resourceType: "return",
      resourceId: id,
      meta,
    });
    return this.get(ctx, orderId, id);
  }

  async decline(
    ctx: TenantContext,
    orderId: string,
    id: string,
    input: DeclineReturnInput,
    meta: RequestMeta,
  ) {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.return.findFirst({ where: { id, orderId } });
    if (!current) throw new NotFoundError("Return");
    if (current.status === "closed" || current.status === "declined") {
      throw new ConflictError("This return is already resolved.");
    }
    await this.prisma.return.update({
      where: { id },
      data: { status: "declined", note: input.note ?? current.note },
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "return.declined",
      resourceType: "return",
      resourceId: id,
      meta,
    });
    return this.get(ctx, orderId, id);
  }

  async receive(
    ctx: TenantContext,
    orderId: string,
    id: string,
    input: ReceiveReturnInput,
    meta: RequestMeta,
  ) {
    const storeId = ctx.storeId as string;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({ where: { ...this.orderScope(ctx), id: orderId } });
      if (!order) throw new NotFoundError("Order");
      const current = await tx.return.findFirst({ where: { id, orderId }, include: { items: true } });
      if (!current) throw new NotFoundError("Return");
      if (current.status !== "approved" && current.status !== "requested") {
        throw new ConflictError("Only a requested or approved return can be received.");
      }
      const location = input.locationId
        ? await tx.location.findFirst({ where: { id: input.locationId, storeId, isActive: true } })
        : await tx.location.findFirst({ where: { storeId, isActive: true, isDefault: true } });

      if (location) {
        const orderItems = await tx.orderItem.findMany({
          where: { id: { in: current.items.map((i) => i.orderItemId) } },
          select: { id: true, variantId: true },
        });
        const variantByItem = new Map(orderItems.map((i) => [i.id, i.variantId]));
        for (const line of current.items.filter((i) => i.restock)) {
          const variantId = variantByItem.get(line.orderItemId);
          if (!variantId) continue;
          await this.reservations.restockVariant(ctx, tx, {
            variantId,
            locationId: location.id,
            quantity: line.quantity,
            reason: "return",
            reference: current.id,
          });
        }
      }

      await tx.return.update({ where: { id }, data: { status: "received", receivedAt: new Date() } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "return.received",
          resourceType: "return",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "return.received", { orderId, returnId: id }, tx);
    });
    return this.get(ctx, orderId, id);
  }

  async close(
    ctx: TenantContext,
    orderId: string,
    id: string,
    input: CloseReturnInput,
    meta: RequestMeta,
  ) {
    await this.requireOrder(ctx, orderId);
    const current = await this.prisma.return.findFirst({ where: { id, orderId }, include: { items: true } });
    if (!current) throw new NotFoundError("Return");
    if (current.status !== "received") throw new ConflictError("Receive this return before closing it.");

    if (current.resolution === "refund" && input.createRefund) {
      const orderItems = await this.prisma.orderItem.findMany({
        where: { id: { in: current.items.map((i) => i.orderItemId) } },
        select: { id: true, unitPrice: true },
      });
      const priceByItem = new Map(orderItems.map((i) => [i.id, i.unitPrice]));
      const amount = current.items.reduce(
        (sum, line) => sum + Number(priceByItem.get(line.orderItemId) ?? 0n) * line.quantity,
        0,
      );
      await this.payments.createRefund(
        ctx,
        orderId,
        {
          amount,
          reason: `Return: ${current.reason}`,
          restock: false,
          items: current.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
        },
        meta,
        id,
      );
    }
    await this.prisma.return.update({ where: { id }, data: { status: "closed", closedAt: new Date() } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "return.closed",
      resourceType: "return",
      resourceId: id,
      meta,
    });
    await this.events.publish(ctx, "return.closed", { orderId, returnId: id });
    return this.get(ctx, orderId, id);
  }
}
