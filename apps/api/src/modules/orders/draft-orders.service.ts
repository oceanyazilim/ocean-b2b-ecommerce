import { Injectable } from "@nestjs/common";
import { Prisma } from "@ocean/db";
import type {
  Address,
  BuyerInput,
  CreateDraftOrderInput,
  DraftLineInput,
  DraftOrderDetail,
  DraftOrderListQuery,
  DraftOrderStatus,
  DraftOrderSummary,
  Paginated,
  UpdateDraftOrderInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney, toMoneyOrNull } from "../catalog/money";
import { EventsService } from "../events/events.service";
import { ShippingEligibilityService } from "../shipping/shipping-eligibility.service";
import { IdempotencyService } from "./idempotency.service";
import { LineQuoterService, type ResolvedBuyer } from "./line-quoter.service";
import { OrderPlacementService } from "./order-placement.service";
import { buyerInclude, toBuyerSummary } from "./order.mapper";

const include = {
  ...buyerInclude,
  createdBy: { select: { id: true, name: true } },
  items: { orderBy: { position: "asc" as const } },
} satisfies Prisma.DraftOrderInclude;
type DraftRow = Prisma.DraftOrderGetPayload<{ include: typeof include }>;

const json = (value: unknown) =>
  value === null || value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

// Merchant-created orders (spec §28). Lines are re-quoted on read so the draft always shows
// today's price, unless a line carries a deliberate custom price.
@Injectable()
export class DraftOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoter: LineQuoterService,
    private readonly placement: OrderPlacementService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly shippingEligibility: ShippingEligibilityService,
  ) {}

  private scope(ctx: TenantContext): Prisma.DraftOrderWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: DraftRow): DraftOrderSummary {
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      status: row.status as DraftOrderStatus,
      buyer: toBuyerSummary(row),
      email: row.email,
      currency: row.currency,
      poNumber: row.poNumber,
      tags: row.tags,
      itemCount: row.items.reduce((sum, i) => sum + i.quantity, 0),
      total: toMoney(row.total, row.currency),
      completedOrderId: row.completedOrderId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(
    ctx: TenantContext,
    query: DraftOrderListQuery,
  ): Promise<Paginated<DraftOrderSummary>> {
    const numeric = query.q?.replace(/^D/i, "");
    const rows = await this.prisma.draftOrder.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                ...(numeric && /^\d+$/.test(numeric) ? [{ number: Number(numeric) }] : []),
                { email: { contains: query.q, mode: "insensitive" as const } },
                { poNumber: { contains: query.q, mode: "insensitive" as const } },
                { company: { displayName: { contains: query.q, mode: "insensitive" as const } } },
                { customer: { lastName: { contains: query.q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      include,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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

  async get(ctx: TenantContext, id: string): Promise<DraftOrderDetail> {
    const row = await this.prisma.draftOrder.findFirst({
      where: { ...this.scope(ctx), id },
      include,
    });
    if (!row) throw new NotFoundError("Draft order");
    return this.toDetail(ctx, row);
  }

  private async toDetail(ctx: TenantContext, row: DraftRow): Promise<DraftOrderDetail> {
    const buyer = await this.quoter.resolveBuyer(ctx, {
      customerId: row.customerId,
      companyId: row.companyId,
      companyLocationId: row.companyLocationId,
    });
    const quote = await this.quoter.quote(
      ctx,
      buyer,
      row.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        customUnitPrice: i.priceSource === "custom" ? Number(i.unitPrice) : null,
      })),
      {
        shippingAddress: (row.shippingAddress as unknown as Address | null) ?? null,
        billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
        shippingRateId: row.shippingRateId,
      },
    );
    const shippingAddress = (row.shippingAddress as unknown as Address | null) ?? null;
    const availableShippingRates = await this.shippingEligibility.eligibleRates(ctx, {
      countryCode: shippingAddress?.countryCode ?? null,
      subtotal: quote.totals.subtotal.amount,
      weightGrams: quote.shippableWeightGrams,
    });
    const shippingRate = row.shippingRateId
      ? (availableShippingRates.find((r) => r.id === row.shippingRateId) ?? null)
      : null;
    const byVariant = new Map(row.items.map((i) => [i.variantId, i]));
    return {
      ...this.toSummary(row),
      note: row.note,
      shippingAddress,
      billingAddress: (row.billingAddress as unknown as Address | null) ?? null,
      items: quote.lines.map((l) => {
        const item = byVariant.get(l.variantId)!;
        return {
          ...l,
          id: item.id,
          customUnitPrice:
            item.priceSource === "custom" ? toMoneyOrNull(item.unitPrice, row.currency) : null,
        };
      }),
      totals: quote.totals,
      shippingRate,
      availableShippingRates,
      catalogRestricted: quote.catalogRestricted,
      ready: quote.ready,
      problems: quote.problems,
      version: row.version,
    };
  }

  async create(ctx: TenantContext, input: CreateDraftOrderInput, meta: RequestMeta) {
    const buyer = await this.quoter.resolveBuyer(ctx, input.buyer);
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";
    const lines = await this.priceLines(ctx, buyer, input.items, {
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress,
      shippingRateId: input.shippingRateId,
    });
    const id = await this.prisma.$transaction(async (tx) => {
      const seq = await tx.store.update({
        where: { id: ctx.storeId as string },
        data: { draftSequence: { increment: 1 } },
        select: { draftSequence: true },
      });
      const created = await tx.draftOrder.create({
        data: {
          storeId: ctx.storeId as string,
          organizationId: ctx.organizationId,
          number: seq.draftSequence,
          name: `D${seq.draftSequence}`,
          customerId: buyer.customerId,
          companyId: buyer.companyId,
          companyLocationId: buyer.companyLocationId,
          email: input.email ?? buyer.summary.customer?.email ?? null,
          currency,
          poNumber: input.poNumber ?? null,
          note: input.note ?? null,
          tags: [...new Set(input.tags)],
          shippingAddress: json(input.shippingAddress),
          billingAddress: json(input.billingAddress),
          shippingRateId: input.shippingRateId ?? null,
          subtotal: BigInt(lines.subtotal),
          total: BigInt(lines.total),
          createdById: ctx.actor.id,
          items: { create: lines.rows },
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "draft_order.created",
          resourceType: "draft_order",
          resourceId: created.id,
          after: { name: created.name, total: lines.total },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "draft_order.created", { draftOrderId: created.id }, tx);
      return created.id;
    });
    return this.get(ctx, id);
  }

  async update(ctx: TenantContext, id: string, input: UpdateDraftOrderInput, meta: RequestMeta) {
    const current = await this.prisma.draftOrder.findFirst({
      where: { ...this.scope(ctx), id },
      include,
    });
    if (!current) throw new NotFoundError("Draft order");
    if (current.status !== "open") throw new ConflictError(`This draft is ${current.status}.`);
    if (current.version !== input.version) {
      throw new ConflictError(
        "This draft was changed by someone else. Reload to see the latest version.",
      );
    }
    const buyerInput: BuyerInput = input.buyer
      ? {
          customerId:
            input.buyer.customerId === undefined ? current.customerId : input.buyer.customerId,
          companyId:
            input.buyer.companyId === undefined ? current.companyId : input.buyer.companyId,
          companyLocationId:
            input.buyer.companyLocationId === undefined
              ? current.companyLocationId
              : input.buyer.companyLocationId,
        }
      : {
          customerId: current.customerId,
          companyId: current.companyId,
          companyLocationId: current.companyLocationId,
        };
    const buyer = await this.quoter.resolveBuyer(ctx, buyerInput);
    const itemsInput: DraftLineInput[] =
      input.items ??
      current.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        customUnitPrice: i.priceSource === "custom" ? Number(i.unitPrice) : null,
      }));
    const shippingRateId =
      input.shippingRateId === undefined ? current.shippingRateId : input.shippingRateId;
    const options = {
      shippingAddress:
        input.shippingAddress === undefined
          ? ((current.shippingAddress as unknown as Address | null) ?? null)
          : input.shippingAddress,
      billingAddress:
        input.billingAddress === undefined
          ? ((current.billingAddress as unknown as Address | null) ?? null)
          : input.billingAddress,
      shippingRateId,
    };
    const lines = await this.priceLines(ctx, buyer, itemsInput, options);
    await this.prisma.$transaction(async (tx) => {
      await tx.draftOrderItem.deleteMany({ where: { draftOrderId: id } });
      await tx.draftOrder.update({
        where: { id },
        data: {
          customerId: buyer.customerId,
          companyId: buyer.companyId,
          companyLocationId: buyer.companyLocationId,
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.poNumber !== undefined ? { poNumber: input.poNumber } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.tags !== undefined ? { tags: [...new Set(input.tags)] } : {}),
          ...(input.shippingAddress !== undefined
            ? {
                shippingAddress: input.shippingAddress
                  ? json(input.shippingAddress)
                  : Prisma.DbNull,
              }
            : {}),
          ...(input.billingAddress !== undefined
            ? { billingAddress: input.billingAddress ? json(input.billingAddress) : Prisma.DbNull }
            : {}),
          ...(input.shippingRateId !== undefined ? { shippingRateId: input.shippingRateId } : {}),
          subtotal: BigInt(lines.subtotal),
          total: BigInt(lines.total),
          version: { increment: 1 },
          items: { create: lines.rows },
        },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "draft_order.updated",
          resourceType: "draft_order",
          resourceId: id,
          after: { total: lines.total, itemCount: lines.rows.length },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "draft_order.updated", { draftOrderId: id }, tx);
    });
    return this.get(ctx, id);
  }

  async complete(ctx: TenantContext, id: string, idempotencyKey: string | null, meta: RequestMeta) {
    return this.idempotency.run(ctx, `draft-complete:${id}`, idempotencyKey, { id }, async () => {
      const current = await this.prisma.draftOrder.findFirst({
        where: { ...this.scope(ctx), id },
        include,
      });
      if (!current) throw new NotFoundError("Draft order");
      if (current.status === "completed" && current.completedOrderId) {
        throw new ConflictError("This draft was already completed.");
      }
      if (current.status !== "open") throw new ConflictError(`This draft is ${current.status}.`);
      const buyer = await this.quoter.resolveBuyer(ctx, {
        customerId: current.customerId,
        companyId: current.companyId,
        companyLocationId: current.companyLocationId,
      });
      const orderId = await this.placement.place(
        ctx,
        {
          buyer,
          lines: current.items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            customUnitPrice: i.priceSource === "custom" ? Number(i.unitPrice) : null,
          })),
          email: current.email,
          poNumber: current.poNumber,
          note: current.note,
          tags: current.tags,
          shippingAddress: (current.shippingAddress as unknown as Address | null) ?? null,
          billingAddress: (current.billingAddress as unknown as Address | null) ?? null,
          shippingRateId: current.shippingRateId,
          source: "draft_order",
          draftOrderId: current.id,
        },
        meta,
      );
      await this.audit.record({
        organizationId: ctx.organizationId,
        storeId: ctx.storeId,
        actorId: ctx.actor.id,
        action: "draft_order.completed",
        resourceType: "draft_order",
        resourceId: id,
        after: { orderId },
        meta,
      });
      await this.events.publish(ctx, "draft_order.completed", { draftOrderId: id, orderId });
      return { orderId };
    });
  }

  async cancel(ctx: TenantContext, id: string, meta: RequestMeta): Promise<DraftOrderDetail> {
    const current = await this.prisma.draftOrder.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Draft order");
    if (current.status !== "open") throw new ConflictError(`This draft is ${current.status}.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.draftOrder.update({
        where: { id },
        data: { status: "cancelled", version: { increment: 1 } },
      });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "draft_order.cancelled",
          resourceType: "draft_order",
          resourceId: id,
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "draft_order.cancelled", { draftOrderId: id }, tx);
    });
    return this.get(ctx, id);
  }

  // Prices lines for storage: quoted price unless the merchant set a custom one.
  private async priceLines(
    ctx: TenantContext,
    buyer: ResolvedBuyer,
    items: DraftLineInput[],
    options: {
      shippingAddress?: Address | null | undefined;
      billingAddress?: Address | null | undefined;
      shippingRateId?: string | null | undefined;
    },
  ) {
    const quote = await this.quoter.quote(
      ctx,
      buyer,
      items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        customUnitPrice: i.customUnitPrice ?? null,
      })),
      {
        shippingAddress: options.shippingAddress ?? null,
        billingAddress: options.billingAddress ?? null,
        shippingRateId: options.shippingRateId ?? null,
      },
    );
    const unknown = quote.lines.filter((l) =>
      l.problems.some((p) => p.includes("not available for sale")),
    );
    if (unknown.length) {
      throw new ValidationError(`${unknown[0]!.title} is not available for sale.`, [
        { path: "items", message: "Unavailable product" },
      ]);
    }
    const storeId = ctx.storeId as string;
    return {
      subtotal: quote.totals.subtotal.amount,
      total: quote.totals.total.amount,
      rows: quote.lines.map((l, position) => ({
        storeId,
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: BigInt(l.unitPrice.amount),
        priceSource: l.priceSource,
        position,
      })),
    };
  }
}
