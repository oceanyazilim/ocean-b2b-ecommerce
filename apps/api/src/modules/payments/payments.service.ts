import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  ConfirmPaymentInput,
  CreatePaymentInput,
  CreateRefundInput,
  PaymentSummary,
  RefundSummary,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";
import { InventoryReservationsService } from "../inventory/inventory-reservations.service";
import { ManualPaymentAdapter } from "./adapters/manual.adapter";
import { TestPaymentAdapter } from "./adapters/test.adapter";
import type { PaymentAdapter } from "./psp-adapter";

const paymentInclude = { transactions: { orderBy: { createdAt: "asc" as const } } };
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
type RefundRow = Prisma.RefundGetPayload<{ include: { items: true } }>;

// Every order can carry more than one payment attempt over time (retry after a decline, a
// second instalment); PaymentsService orchestrates the PSP adapter and keeps Order.paymentStatus
// in sync. Refunds live here too since they always settle back through the same adapter.
@Injectable()
export class PaymentsService {
  private readonly adapters: Map<string, PaymentAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly reservations: InventoryReservationsService,
    manual: ManualPaymentAdapter,
    test: TestPaymentAdapter,
  ) {
    this.adapters = new Map<string, PaymentAdapter>([
      [manual.provider, manual],
      [test.provider, test],
    ]);
  }

  private scope(ctx: TenantContext): Prisma.OrderWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  toSummary(row: PaymentRow, currency: string): PaymentSummary {
    return {
      id: row.id,
      provider: row.provider as PaymentSummary["provider"],
      methodName: row.methodName,
      status: row.status,
      amount: toMoney(row.amount, currency),
      capturedAmount: toMoney(row.capturedAmount, currency),
      refundedAmount: toMoney(row.refundedAmount, currency),
      providerRef: row.providerRef,
      failureReason: row.failureReason,
      transactions: row.transactions.map((t) => ({
        id: t.id,
        kind: t.kind,
        status: t.status,
        amount: toMoney(t.amount, currency),
        providerRef: t.providerRef,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  toRefundSummary(row: RefundRow, currency: string): RefundSummary {
    return {
      id: row.id,
      amount: toMoney(row.amount, currency),
      reason: row.reason,
      status: row.status,
      restock: row.restock,
      items: row.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async requireOrder(ctx: TenantContext, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { ...this.scope(ctx), id: orderId },
      select: { id: true, currency: true, total: true, status: true, paymentStatus: true },
    });
    if (!order) throw new NotFoundError("Order");
    return order;
  }

  private async recomputePaymentStatus(orderId: string, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const payments = await tx.payment.findMany({ where: { orderId } });
    const refunds = await tx.refund.findMany({ where: { orderId, status: "succeeded" } });
    const captured = payments.reduce((sum, p) => sum + p.capturedAmount, 0n);
    const refunded = refunds.reduce((sum, r) => sum + r.amount, 0n);
    const net = captured - refunded;
    let status: typeof order.paymentStatus;
    if (net <= 0n && refunded > 0n) status = "refunded";
    else if (refunded > 0n && net > 0n) status = "partially_refunded";
    else if (net >= order.total && order.total > 0n) status = "paid";
    else if (net > 0n) status = "partially_paid";
    else if (payments.some((p) => p.status === "authorized")) status = "authorized";
    else if (payments.length > 0 && payments.every((p) => p.status === "voided")) status = "voided";
    else status = "pending";
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
    return status;
  }

  // Called both from the checkout controller and, inside its own transaction, from
  // OrderPlacementService right after an order is created.
  async charge(
    ctx: TenantContext,
    orderId: string,
    input: CreatePaymentInput,
    meta: RequestMeta,
  ): Promise<PaymentSummary> {
    const order = await this.requireOrder(ctx, orderId);
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, storeId: ctx.storeId as string, isEnabled: true },
    });
    if (!method) {
      throw new ValidationError("That payment method is not available.", [
        { path: "paymentMethodId", message: "Unknown or disabled" },
      ]);
    }
    const amount = input.amount ?? Number(order.total);
    const adapter = this.adapters.get(method.provider);
    if (!adapter) throw new ValidationError("This payment provider is not configured.");
    const result = await adapter.charge({
      amount,
      currency: order.currency,
      orderId,
      config: method.config as Record<string, unknown>,
    });
    const paymentId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          orderId,
          currency: order.currency,
          paymentMethodId: method.id,
          provider: method.provider,
          methodName: method.name,
          status: result.status === "captured" ? "captured" : result.status === "failed" ? "failed" : "pending",
          amount: BigInt(amount),
          capturedAmount: result.status === "captured" ? BigInt(amount) : 0n,
          providerRef: result.providerRef,
          failureReason: result.failureReason ?? null,
          createdById: ctx.actor.id,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          storeId: ctx.storeId as string,
          kind: result.status === "captured" ? "capture" : "authorize",
          status: result.status === "captured" ? "succeeded" : result.status === "failed" ? "failed" : "pending",
          amount: BigInt(amount),
          providerRef: result.providerRef,
        },
      });
      await this.recomputePaymentStatus(orderId, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "payments.charged",
          resourceType: "payment",
          resourceId: payment.id,
          after: { orderId, provider: method.provider, amount, status: result.status },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "payment.created", { orderId, paymentId: payment.id }, tx);
      return payment.id;
    });
    return this.get(ctx, orderId, paymentId);
  }

  async confirm(
    ctx: TenantContext,
    orderId: string,
    paymentId: string,
    input: ConfirmPaymentInput,
    meta: RequestMeta,
  ): Promise<PaymentSummary> {
    await this.requireOrder(ctx, orderId);
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, orderId } });
      if (!payment) throw new NotFoundError("Payment");
      if (payment.status !== "pending") {
        throw new ConflictError("Only a pending payment can be confirmed.");
      }
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: "captured",
          capturedAmount: payment.amount,
          providerRef: input.providerRef ?? payment.providerRef,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          storeId: ctx.storeId as string,
          kind: "capture",
          status: "succeeded",
          amount: payment.amount,
          providerRef: input.providerRef ?? null,
        },
      });
      await this.recomputePaymentStatus(orderId, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "payments.confirmed",
          resourceType: "payment",
          resourceId: paymentId,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "payment.confirmed", { orderId, paymentId }, tx);
    });
    return this.get(ctx, orderId, paymentId);
  }

  async void(ctx: TenantContext, orderId: string, paymentId: string, meta: RequestMeta) {
    await this.requireOrder(ctx, orderId);
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, orderId } });
      if (!payment) throw new NotFoundError("Payment");
      if (payment.status !== "pending" && payment.status !== "authorized") {
        throw new ConflictError("Only a pending or authorized payment can be voided.");
      }
      await tx.payment.update({ where: { id: paymentId }, data: { status: "voided" } });
      await tx.paymentTransaction.create({
        data: {
          paymentId,
          storeId: ctx.storeId as string,
          kind: "void",
          status: "succeeded",
          amount: payment.amount,
        },
      });
      await this.recomputePaymentStatus(orderId, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "payments.voided",
          resourceType: "payment",
          resourceId: paymentId,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "payment.voided", { orderId, paymentId }, tx);
    });
    return this.get(ctx, orderId, paymentId);
  }

  async list(ctx: TenantContext, orderId: string): Promise<PaymentSummary[]> {
    const order = await this.requireOrder(ctx, orderId);
    const rows = await this.prisma.payment.findMany({
      where: { orderId },
      include: paymentInclude,
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.toSummary(r, order.currency));
  }

  async get(ctx: TenantContext, orderId: string, paymentId: string): Promise<PaymentSummary> {
    const order = await this.requireOrder(ctx, orderId);
    const row = await this.prisma.payment.findFirst({
      where: { id: paymentId, orderId },
      include: paymentInclude,
    });
    if (!row) throw new NotFoundError("Payment");
    return this.toSummary(row, order.currency);
  }

  // ---- refunds ------------------------------------------------------------------------------

  async createRefund(
    ctx: TenantContext,
    orderId: string,
    input: CreateRefundInput,
    meta: RequestMeta,
    returnId?: string,
  ): Promise<RefundSummary> {
    const order = await this.requireOrder(ctx, orderId);
    const capturedPayment = await this.prisma.payment.findFirst({
      where: { orderId, status: "captured" },
      orderBy: { createdAt: "desc" },
    });
    let refundResult: { status: "succeeded" | "pending" | "failed"; providerRef: string | null } = {
      status: "pending",
      providerRef: null,
    };
    if (capturedPayment) {
      const adapter = this.adapters.get(capturedPayment.provider);
      if (adapter) {
        refundResult = await adapter.refund({
          amount: input.amount,
          currency: order.currency,
          providerRef: capturedPayment.providerRef,
          config: {},
        });
      }
    }
    const refundId = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          orderId,
          paymentId: capturedPayment?.id ?? null,
          amount: BigInt(input.amount),
          currency: order.currency,
          reason: input.reason ?? null,
          status: refundResult.status,
          restock: input.restock,
          createdById: ctx.actor.id,
          items: { create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
        },
      });
      if (capturedPayment) {
        await tx.paymentTransaction.create({
          data: {
            paymentId: capturedPayment.id,
            storeId: ctx.storeId as string,
            kind: "refund",
            status: refundResult.status === "succeeded" ? "succeeded" : "pending",
            amount: BigInt(input.amount),
            providerRef: refundResult.providerRef,
          },
        });
        if (refundResult.status === "succeeded") {
          await tx.payment.update({
            where: { id: capturedPayment.id },
            data: { refundedAmount: { increment: BigInt(input.amount) } },
          });
        }
      }
      if (refundResult.status === "succeeded") {
        for (const item of input.items) {
          await tx.orderItem.update({
            where: { id: item.orderItemId },
            data: { refundedQuantity: { increment: item.quantity } },
          });
        }
        if (input.restock && input.items.length > 0) {
          const location = await tx.location.findFirst({
            where: { storeId: ctx.storeId as string, isActive: true, isDefault: true },
          });
          if (location) {
            const orderItems = await tx.orderItem.findMany({
              where: { id: { in: input.items.map((i) => i.orderItemId) } },
              select: { id: true, variantId: true },
            });
            const variantByItem = new Map(orderItems.map((i) => [i.id, i.variantId]));
            for (const line of input.items) {
              const variantId = variantByItem.get(line.orderItemId);
              if (!variantId) continue;
              await this.reservations.restockVariant(ctx, tx, {
                variantId,
                locationId: location.id,
                quantity: line.quantity,
                reason: "return",
                reference: refund.id,
              });
            }
          }
        }
      }
      if (returnId) {
        await tx.return.update({ where: { id: returnId }, data: { refundId: refund.id } });
      }
      await this.recomputePaymentStatus(orderId, tx);
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "payments.refunded",
          resourceType: "refund",
          resourceId: refund.id,
          after: { orderId, amount: input.amount, status: refundResult.status },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "refund.created", { orderId, refundId: refund.id }, tx);
      return refund.id;
    });
    const row = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { items: true },
    });
    return this.toRefundSummary(row, order.currency);
  }

  async listRefunds(ctx: TenantContext, orderId: string): Promise<RefundSummary[]> {
    const order = await this.requireOrder(ctx, orderId);
    const rows = await this.prisma.refund.findMany({
      where: { orderId },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.toRefundSummary(r, order.currency));
  }
}
