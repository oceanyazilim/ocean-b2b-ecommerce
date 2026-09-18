import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  CancelOrderInput,
  OrderDetail,
  OrderListQuery,
  OrderStats,
  OrderSummary,
  Paginated,
  UpdateOrderInput,
} from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { STORAGE_ADAPTER, type StorageAdapter } from "../../infrastructure/storage/storage.types";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { PaymentsService } from "../payments/payments.service";
import { FulfillmentsService } from "./fulfillments.service";
import {
  orderDetailInclude,
  orderSummaryInclude,
  toOrderDetail,
  toOrderSummary,
} from "./order.mapper";
import { ReturnsService } from "./returns.service";

const SORT: Record<OrderListQuery["sort"], Prisma.OrderOrderByWithRelationInput[]> = {
  created_desc: [{ createdAt: "desc" }, { id: "desc" }],
  created_asc: [{ createdAt: "asc" }, { id: "asc" }],
  total_desc: [{ total: "desc" }, { id: "desc" }],
  number_desc: [{ number: "desc" }],
};

const OPEN_STATUSES = ["pending_approval", "confirmed", "processing"] as const;
const json = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: InventoryReservationsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly payments: PaymentsService,
    private readonly fulfillments: FulfillmentsService,
    private readonly returns: ReturnsService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter,
  ) {}

  private scope(ctx: TenantContext): Prisma.OrderWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  async list(ctx: TenantContext, query: OrderListQuery): Promise<Paginated<OrderSummary>> {
    const numeric = query.q?.replace(/^#/, "");
    const where: Prisma.OrderWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.open ? { status: { in: [...OPEN_STATUSES] } } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.fulfillmentStatus ? { fulfillmentStatus: query.fulfillmentStatus } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.q
        ? {
            OR: [
              ...(numeric && /^\d+$/.test(numeric) ? [{ number: Number(numeric) }] : []),
              { email: { contains: query.q, mode: "insensitive" as const } },
              { poNumber: { contains: query.q, mode: "insensitive" as const } },
              { customer: { lastName: { contains: query.q, mode: "insensitive" as const } } },
              { customer: { firstName: { contains: query.q, mode: "insensitive" as const } } },
              { company: { displayName: { contains: query.q, mode: "insensitive" as const } } },
              { items: { some: { sku: { contains: query.q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      include: orderSummaryInclude,
      orderBy: SORT[query.sort],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toOrderSummary),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async stats(ctx: TenantContext): Promise<OrderStats> {
    const scope = this.scope(ctx);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [store, openOrders, awaitingPayment, toFulfill, recent] = await Promise.all([
      this.prisma.store.findUnique({
        where: { id: ctx.storeId as string },
        select: { defaultCurrency: true },
      }),
      this.prisma.order.count({ where: { ...scope, status: { in: [...OPEN_STATUSES] } } }),
      this.prisma.order.count({
        where: { ...scope, status: { in: [...OPEN_STATUSES] }, paymentStatus: "pending" },
      }),
      this.prisma.order.count({
        where: {
          ...scope,
          status: { in: [...OPEN_STATUSES] },
          fulfillmentStatus: { in: ["unfulfilled", "partially_fulfilled"] },
        },
      }),
      this.prisma.order.aggregate({
        where: { ...scope, status: { not: "cancelled" }, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);
    const currency = store?.defaultCurrency ?? "TRY";
    const count = recent._count._all;
    const gross = Number(recent._sum.total ?? 0);
    return {
      currency,
      openOrders,
      awaitingPayment,
      toFulfill,
      ordersLast30Days: count,
      grossSalesLast30Days: toMoney(gross, currency),
      averageOrderValueLast30Days: toMoney(count ? Math.round(gross / count) : 0, currency),
    };
  }

  async get(ctx: TenantContext, id: string): Promise<OrderDetail> {
    const row = await this.prisma.order.findFirst({
      where: { ...this.scope(ctx), id },
      include: orderDetailInclude,
    });
    if (!row) throw new NotFoundError("Order");
    const actorIds = [...new Set(row.events.map((e) => e.actorId).filter((v): v is string => !!v))];
    const [actors, payments, refunds, fulfillments, returns] = await Promise.all([
      actorIds.length
        ? this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      this.payments.list(ctx, id),
      this.payments.listRefunds(ctx, id),
      this.fulfillments.list(ctx, id),
      this.returns.list(ctx, id),
    ]);
    return {
      ...toOrderDetail(row, new Map(actors.map((a) => [a.id, a])), this.storage),
      payments,
      refunds,
      fulfillments,
      returns,
    };
  }

  async update(ctx: TenantContext, id: string, input: UpdateOrderInput, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Order");
      if (current.version !== input.version) {
        throw new ConflictError(
          "This order was changed by someone else. Reload to see the latest version.",
        );
      }
      const data: Prisma.OrderUncheckedUpdateInput = { version: { increment: 1 } };
      const changed: string[] = [];
      if (input.note !== undefined) {
        data.note = input.note;
        changed.push("note");
      }
      if (input.tags !== undefined) {
        data.tags = [...new Set(input.tags)];
        changed.push("tags");
      }
      if (input.poNumber !== undefined) {
        data.poNumber = input.poNumber;
        changed.push("poNumber");
      }
      if (input.email !== undefined) {
        data.email = input.email;
        changed.push("email");
      }
      if (input.shippingAddress !== undefined) {
        data.shippingAddress = input.shippingAddress ? json(input.shippingAddress) : Prisma.DbNull;
        changed.push("shippingAddress");
      }
      if (input.billingAddress !== undefined) {
        data.billingAddress = input.billingAddress ? json(input.billingAddress) : Prisma.DbNull;
        changed.push("billingAddress");
      }
      await tx.order.update({ where: { id }, data });
      await tx.orderEvent.create({
        data: {
          orderId: id,
          storeId: ctx.storeId as string,
          type: "order.updated",
          payload: { fields: changed },
          actorType: ctx.actor.type,
          actorId: ctx.actor.id,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "order.updated",
          resourceType: "order",
          resourceId: id,
          metadata: { fields: changed },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "order.updated", { orderId: id, fields: changed }, tx);
    });
    return this.get(ctx, id);
  }

  async addNote(ctx: TenantContext, id: string, message: string): Promise<OrderDetail> {
    const current = await this.prisma.order.findFirst({
      where: { ...this.scope(ctx), id },
      select: { id: true },
    });
    if (!current) throw new NotFoundError("Order");
    await this.prisma.orderEvent.create({
      data: {
        orderId: id,
        storeId: ctx.storeId as string,
        type: "order.note",
        payload: { message },
        actorType: ctx.actor.type,
        actorId: ctx.actor.id,
      },
    });
    return this.get(ctx, id);
  }

  // Only untouched orders can be cancelled directly (nothing paid, nothing shipped); void the
  // payment or refund it first, and use a return to unwind shipped units.
  async cancel(ctx: TenantContext, id: string, input: CancelOrderInput, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.order.findFirst({
        where: { ...this.scope(ctx), id },
        include: { items: { include: { reservations: { where: { releasedAt: null } } } } },
      });
      if (!current) throw new NotFoundError("Order");
      if (current.status === "cancelled")
        throw new ConflictError("This order is already cancelled.");
      if (current.fulfillmentStatus !== "unfulfilled") {
        throw new ConflictError("Shipped orders cannot be cancelled; create a return instead.");
      }
      if (current.paymentStatus !== "pending" && current.paymentStatus !== "voided") {
        throw new ConflictError("Refund the payment before cancelling this order.");
      }
      const holds = current.items.flatMap((i) => i.reservations);
      if (input.restock && holds.length) {
        await this.reservations.release(
          ctx,
          holds.map((h) => ({
            inventoryItemId: h.inventoryItemId,
            locationId: h.locationId,
            quantity: h.quantity,
          })),
          tx,
        );
      }
      if (holds.length) {
        await tx.orderItemReservation.updateMany({
          where: { id: { in: holds.map((h) => h.id) } },
          data: { releasedAt: new Date() },
        });
      }
      await tx.order.update({
        where: { id },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelReason: input.reason,
          closedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (current.customerId) {
        await tx.customer.update({
          where: { id: current.customerId },
          data: { ordersCount: { decrement: 1 }, totalSpent: { decrement: current.total } },
        });
      }
      await tx.orderEvent.create({
        data: {
          orderId: id,
          storeId: ctx.storeId as string,
          type: "order.cancelled",
          payload: { reason: input.reason, restock: input.restock },
          actorType: ctx.actor.type,
          actorId: ctx.actor.id,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "order.cancelled",
          resourceType: "order",
          resourceId: id,
          before: { status: current.status },
          after: { status: "cancelled", reason: input.reason },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "order.cancelled", { orderId: id, reason: input.reason }, tx);
    });
    return this.get(ctx, id);
  }
}
