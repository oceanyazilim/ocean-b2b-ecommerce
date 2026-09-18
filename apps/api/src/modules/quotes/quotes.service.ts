import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  CreateQuoteInput,
  DeclineQuoteInput,
  Paginated,
  QuoteDetail,
  QuoteListQuery,
  QuoteSummary,
  UpdateQuoteInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";
import { LineQuoterService } from "../orders/line-quoter.service";
import { OrderPlacementService } from "../orders/order-placement.service";

const include = {
  items: true,
  company: { select: { displayName: true } },
} satisfies Prisma.QuoteInclude;
type QuoteRow = Prisma.QuoteGetPayload<{ include: typeof include }>;

const itemInclude = {
  variant: { select: { title: true, sku: true, product: { select: { title: true } } } },
} satisfies Prisma.QuoteItemInclude;

// A staff-negotiated price offer that becomes an order once the buyer accepts it. Line prices
// are captured explicitly (not re-quoted from PricingService) because a quote is a deliberate,
// time-boxed offer — converting it hands those exact prices to OrderPlacementService unchanged.
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoter: LineQuoterService,
    private readonly placement: OrderPlacementService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.QuoteWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: QuoteRow): QuoteSummary {
    const total = row.items.reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity - Number(i.discount), 0);
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      companyId: row.companyId,
      companyName: row.company.displayName,
      customerId: row.customerId,
      currency: row.currency,
      total: toMoney(total, row.currency),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      convertedOrderId: row.convertedOrderId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext, query: QuoteListQuery): Promise<Paginated<QuoteSummary>> {
    const where: Prisma.QuoteWhereInput = {
      ...this.scope(ctx),
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
    };
    const rows = await this.prisma.quote.findMany({
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

  async get(ctx: TenantContext, id: string): Promise<QuoteDetail> {
    const row = await this.prisma.quote.findFirst({
      where: { ...this.scope(ctx), id },
      include: { ...include, items: { include: itemInclude, orderBy: { createdAt: "asc" } } },
    });
    if (!row) throw new NotFoundError("Quote");
    const currency = row.currency;
    return {
      ...this.toSummary(row),
      companyLocationId: row.companyLocationId,
      paymentTerms: (row.paymentTerms as Record<string, unknown>) ?? {},
      notes: row.notes,
      internalNotes: row.internalNotes,
      items: row.items.map((i) => {
        const lineTotal = Number(i.unitPrice) * i.quantity - Number(i.discount);
        return {
          id: i.id,
          variantId: i.variantId,
          title: i.variant.product.title,
          sku: i.variant.sku,
          quantity: i.quantity,
          unitPrice: toMoney(i.unitPrice, currency),
          discount: toMoney(i.discount, currency),
          lineTotal: toMoney(lineTotal, currency),
          note: i.note,
        };
      }),
    };
  }

  private async assertVariants(ctx: TenantContext, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const found = await this.prisma.productVariant.count({
      where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new ValidationError("One or more items are not in this store.", [
        { path: "items", message: "Unknown variant" },
      ]);
    }
  }

  async create(ctx: TenantContext, input: CreateQuoteInput, meta: RequestMeta): Promise<QuoteDetail> {
    const storeId = ctx.storeId as string;
    await this.assertVariants(ctx, input.items.map((i) => i.variantId));
    const company = await this.prisma.company.findFirst({ where: { id: input.companyId, storeId } });
    if (!company) {
      throw new ValidationError("That company is not in this store.", [
        { path: "companyId", message: "Unknown company" },
      ]);
    }
    const id = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.update({
        where: { id: storeId },
        data: { quoteSequence: { increment: 1 } },
        select: { quoteSequence: true },
      });
      const created = await tx.quote.create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          number: `QT-${store.quoteSequence}`,
          companyId: input.companyId,
          companyLocationId: input.companyLocationId ?? null,
          customerId: input.customerId,
          currency: input.currency,
          status: "draft",
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          paymentTerms: input.paymentTerms as Prisma.InputJsonValue,
          notes: input.notes ?? null,
          internalNotes: input.internalNotes ?? null,
          items: {
            create: input.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
              unitPrice: BigInt(i.unitPrice),
              discount: BigInt(i.discount),
              note: i.note ?? null,
            })),
          },
        },
      });
      await tx.quoteEvent.create({
        data: { quoteId: created.id, type: "quote.created", actorId: ctx.actor.id, actorType: ctx.actor.type },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId,
          actorId: ctx.actor.id,
          action: "quote.created",
          resourceType: "quote",
          resourceId: created.id,
          after: { number: created.number, companyId: created.companyId },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "quote.created", { quoteId: created.id }, tx);
      return created.id;
    });
    return this.get(ctx, id);
  }

  private async requireDraft(ctx: TenantContext, id: string) {
    const quote = await this.prisma.quote.findFirst({ where: { ...this.scope(ctx), id } });
    if (!quote) throw new NotFoundError("Quote");
    if (quote.status !== "draft") {
      throw new ConflictError(`This quote is ${quote.status} and can no longer be edited.`);
    }
    return quote;
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateQuoteInput,
    meta: RequestMeta,
  ): Promise<QuoteDetail> {
    await this.requireDraft(ctx, id);
    if (input.items) await this.assertVariants(ctx, input.items.map((i) => i.variantId));
    await this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      }
      await tx.quote.update({
        where: { id },
        data: {
          ...(input.companyLocationId !== undefined ? { companyLocationId: input.companyLocationId } : {}),
          ...(input.expiresAt !== undefined
            ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
            : {}),
          ...(input.paymentTerms !== undefined
            ? { paymentTerms: input.paymentTerms as Prisma.InputJsonValue }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
          ...(input.items
            ? {
                items: {
                  create: input.items.map((i) => ({
                    variantId: i.variantId,
                    quantity: i.quantity,
                    unitPrice: BigInt(i.unitPrice),
                    discount: BigInt(i.discount),
                    note: i.note ?? null,
                  })),
                },
              }
            : {}),
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "quote.updated",
          resourceType: "quote",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "quote.updated", { quoteId: id }, tx);
    });
    return this.get(ctx, id);
  }

  private async transition(
    ctx: TenantContext,
    id: string,
    from: readonly string[],
    to: "sent" | "accepted" | "declined" | "expired",
    meta: RequestMeta,
    extra?: Record<string, unknown>,
  ): Promise<QuoteDetail> {
    const quote = await this.prisma.quote.findFirst({ where: { ...this.scope(ctx), id } });
    if (!quote) throw new NotFoundError("Quote");
    if (!from.includes(quote.status)) {
      throw new ConflictError(`This quote is ${quote.status}; expected ${from.join(" or ")}.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id }, data: { status: to } });
      await tx.quoteEvent.create({
        data: {
          quoteId: id,
          type: `quote.${to}`,
          payload: (extra ?? {}) as Prisma.InputJsonValue,
          actorId: ctx.actor.id,
          actorType: ctx.actor.type,
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: `quote.${to}`,
          resourceType: "quote",
          resourceId: id,
          before: { status: quote.status },
          after: { status: to },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, `quote.${to}`, { quoteId: id }, tx);
    });
    return this.get(ctx, id);
  }

  send(ctx: TenantContext, id: string, meta: RequestMeta) {
    return this.transition(ctx, id, ["draft"], "sent", meta);
  }

  accept(ctx: TenantContext, id: string, meta: RequestMeta) {
    return this.transition(ctx, id, ["sent"], "accepted", meta);
  }

  expire(ctx: TenantContext, id: string, meta: RequestMeta) {
    return this.transition(ctx, id, ["sent", "accepted"], "expired", meta);
  }

  decline(ctx: TenantContext, id: string, input: DeclineQuoteInput, meta: RequestMeta) {
    return this.transition(ctx, id, ["draft", "sent", "accepted"], "declined", meta, {
      reason: input.reason,
    });
  }

  // Accepted quote -> real order, through the same placement pipeline as checkout, with the
  // negotiated line prices preserved (priceSource becomes "custom", same as a draft order).
  async convert(ctx: TenantContext, id: string, meta: RequestMeta): Promise<{ orderId: string }> {
    const quote = await this.prisma.quote.findFirst({
      where: { ...this.scope(ctx), id },
      include: { items: true },
    });
    if (!quote) throw new NotFoundError("Quote");
    if (quote.status !== "accepted") {
      throw new ConflictError("Only an accepted quote can be converted to an order.");
    }
    if (quote.items.length === 0) {
      throw new ValidationError("This quote has no items to convert.");
    }
    const buyer = await this.quoter.resolveBuyer(ctx, {
      customerId: quote.customerId,
      companyId: quote.companyId,
      companyLocationId: quote.companyLocationId,
    });
    const orderId = await this.placement.place(
      ctx,
      {
        buyer,
        lines: quote.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          customUnitPrice: Number(i.unitPrice),
        })),
        email: null,
        poNumber: null,
        note: quote.notes,
        shippingAddress: null,
        billingAddress: null,
        source: "quote",
        quoteId: quote.id,
      },
      meta,
    );
    return { orderId };
  }
}
