import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CreateInvoiceInput,
  InvoiceDetail,
  InvoiceListQuery,
  InvoiceSummary,
  Paginated,
  RecordInvoicePaymentInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";

const include = {
  payments: { orderBy: { createdAt: "asc" as const } },
  order: { select: { currency: true } },
};
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof include }>;

// An invoice is a payment-terms order (net-30, etc.) billed separately from the checkout
// payment flow; InvoicePayment links it to a real Phase 7 Payment row so the money is never
// double-counted between the order's own paymentStatus and the invoice's balance.
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.InvoiceWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: InvoiceRow): InvoiceSummary {
    const amount = Number(row.amount);
    const paid = Number(row.paidAmount);
    const currency = row.order.currency;
    return {
      id: row.id,
      number: row.number,
      orderId: row.orderId,
      companyId: row.companyId,
      status: row.status,
      amount: toMoney(amount, currency),
      paidAmount: toMoney(paid, currency),
      balance: toMoney(amount - paid, currency),
      dueAt: row.dueAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: InvoiceRow): InvoiceDetail {
    const currency = row.order.currency;
    return {
      ...this.toSummary(row),
      payments: row.payments.map((p) => ({
        id: p.id,
        amount: toMoney(p.amount, currency),
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async list(ctx: TenantContext, query: InvoiceListQuery): Promise<Paginated<InvoiceSummary>> {
    const where: Prisma.InvoiceWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    };
    const rows = await this.prisma.invoice.findMany({
      where,
      include,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => this.toSummary(r)),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async get(ctx: TenantContext, id: string): Promise<InvoiceDetail> {
    const row = await this.prisma.invoice.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Invoice");
    return this.toDetail(row);
  }

  async create(ctx: TenantContext, input: CreateInvoiceInput, meta: RequestMeta): Promise<InvoiceDetail> {
    const storeId = ctx.storeId as string;
    const order = await this.prisma.order.findFirst({ where: { id: input.orderId, storeId } });
    if (!order) {
      throw new ValidationError("That order is not in this store.", [
        { path: "orderId", message: "Unknown order" },
      ]);
    }
    if (!order.companyId) {
      throw new ValidationError("Only B2B orders (with a company) can be invoiced.", [
        { path: "orderId", message: "No company on this order" },
      ]);
    }
    const amount = input.amount ?? Number(order.total);
    const id = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.update({
        where: { id: storeId },
        data: { invoiceSequence: { increment: 1 } },
        select: { invoiceSequence: true },
      });
      const created = await tx.invoice.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          orderId: order.id,
          companyId: order.companyId!,
          number: `INV-${store.invoiceSequence}`,
          dueAt: new Date(input.dueAt),
          amount: BigInt(amount),
          paidAmount: 0n,
          status: "pending",
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "invoice.created",
          resourceType: "invoice",
          resourceId: created.id,
          after: { orderId: order.id, amount },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "invoice.created", { invoiceId: created.id, orderId: order.id }, tx);
      return created.id;
    });
    return this.get(ctx, id);
  }

  async recordPayment(
    ctx: TenantContext,
    id: string,
    input: RecordInvoicePaymentInput,
    meta: RequestMeta,
  ): Promise<InvoiceDetail> {
    const storeId = ctx.storeId as string;
    const invoice = await this.prisma.invoice.findFirst({ where: { ...this.scope(ctx), id } });
    if (!invoice) throw new NotFoundError("Invoice");
    if (invoice.status === "cancelled") throw new ConflictError("This invoice is cancelled.");
    const payment = await this.prisma.payment.findFirst({
      where: { id: input.paymentId, storeId, orderId: invoice.orderId },
    });
    if (!payment) {
      throw new ValidationError("That payment is not for this invoice's order.", [
        { path: "paymentId", message: "Unknown payment" },
      ]);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.invoicePayment.create({
        data: { invoiceId: id, paymentId: input.paymentId, amount: BigInt(input.amount) },
      });
      const newPaid = invoice.paidAmount + BigInt(input.amount);
      await tx.invoice.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          status: newPaid >= invoice.amount ? "paid" : invoice.status,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "invoice.payment_recorded",
          resourceType: "invoice",
          resourceId: id,
          after: { amount: input.amount, paymentId: input.paymentId },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "invoice.payment_recorded", { invoiceId: id }, tx);
    });
    return this.get(ctx, id);
  }
}
