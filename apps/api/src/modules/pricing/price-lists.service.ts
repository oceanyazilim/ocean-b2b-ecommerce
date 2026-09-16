import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type {
  AssignmentSummary,
  AssignmentTargetInput,
  CreatePriceListInput,
  CursorPaginationQuery,
  Paginated,
  PriceListDetail,
  PriceListListQuery,
  PriceListPriceEntry,
  PriceListStatus,
  PriceListSummary,
  SetPriceListPricesInput,
  UpdatePriceListInput,
} from "@ocean/types";

import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import { isUniqueViolation } from "../../common/prisma-errors";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  assignmentInclude,
  AssignmentTargetsService,
  toAssignmentSummary,
} from "../catalogs/assignment-targets.service";
import { toMoney, toMoneyOrNull } from "../catalog/money";
import { EventsService } from "../events/events.service";

const summaryInclude = {
  _count: { select: { prices: true, assignments: true } },
} satisfies Prisma.PriceListInclude;
const detailInclude = {
  ...summaryInclude,
  assignments: { include: assignmentInclude, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PriceListInclude;
type SummaryRow = Prisma.PriceListGetPayload<{ include: typeof summaryInclude }>;
type DetailRow = Prisma.PriceListGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class PriceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: AssignmentTargetsService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.PriceListWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  async storeCurrency(ctx: TenantContext): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    return store?.defaultCurrency ?? "TRY";
  }

  private toSummary(row: SummaryRow): PriceListSummary {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      currency: row.currency,
      status: row.status as PriceListStatus,
      adjustmentBps: row.adjustmentBps,
      priority: row.priority,
      priceCount: row._count.prices,
      assignmentCount: row._count.assignments,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(ctx: TenantContext, query: PriceListListQuery): Promise<Paginated<PriceListSummary>> {
    const rows = await this.prisma.priceList.findMany({
      where: {
        ...this.scope(ctx),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
      },
      include: summaryInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
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

  async get(ctx: TenantContext, id: string): Promise<PriceListDetail> {
    const row = await this.prisma.priceList.findFirst({
      where: { ...this.scope(ctx), id },
      include: detailInclude,
    });
    if (!row) throw new NotFoundError("Price list");
    return this.toDetail(row);
  }

  private toDetail(row: DetailRow): PriceListDetail {
    return { ...this.toSummary(row), assignments: row.assignments.map(toAssignmentSummary) };
  }

  async create(ctx: TenantContext, input: CreatePriceListInput, meta: RequestMeta) {
    const storeCurrency = await this.storeCurrency(ctx);
    this.assertCurrency(input.currency, storeCurrency);
    const id = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.priceList.create({
          data: {
            storeId: ctx.storeId as string,
            organizationId: ctx.organizationId,
            name: input.name,
            description: input.description ?? null,
            currency: input.currency ?? storeCurrency,
            status: input.status,
            adjustmentBps: input.adjustmentBps,
            priority: input.priority,
          },
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "price_list.created",
            resourceType: "price_list",
            resourceId: created.id,
            after: {
              name: created.name,
              status: created.status,
              adjustmentBps: created.adjustmentBps,
            },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "price_list.created", { priceListId: created.id }, tx);
        return created.id;
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async update(ctx: TenantContext, id: string, input: UpdatePriceListInput, meta: RequestMeta) {
    if (input.currency !== undefined) {
      this.assertCurrency(input.currency, await this.storeCurrency(ctx));
    }
    await this.prisma
      .$transaction(async (tx) => {
        const current = await tx.priceList.findFirst({ where: { ...this.scope(ctx), id } });
        if (!current) throw new NotFoundError("Price list");
        if (current.version !== input.version) {
          throw new ConflictError(
            "This price list was changed by someone else. Reload to see the latest version.",
          );
        }
        const data: Prisma.PriceListUncheckedUpdateInput = { version: { increment: 1 } };
        if (input.name !== undefined) data.name = input.name;
        if (input.description !== undefined) data.description = input.description;
        if (input.currency !== undefined) data.currency = input.currency;
        if (input.status !== undefined) data.status = input.status;
        if (input.adjustmentBps !== undefined) data.adjustmentBps = input.adjustmentBps;
        if (input.priority !== undefined) data.priority = input.priority;
        await tx.priceList.update({ where: { id }, data });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "price_list.updated",
            resourceType: "price_list",
            resourceId: id,
            before: {
              name: current.name,
              status: current.status,
              adjustmentBps: current.adjustmentBps,
              priority: current.priority,
            },
            after: {
              name: input.name ?? current.name,
              status: input.status ?? current.status,
              adjustmentBps: input.adjustmentBps ?? current.adjustmentBps,
              priority: input.priority ?? current.priority,
            },
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "price_list.updated", { priceListId: id }, tx);
      })
      .catch((error: unknown) => this.rethrowUnique(error));
    return this.get(ctx, id);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.priceList.findFirst({ where: { ...this.scope(ctx), id } });
      if (!current) throw new NotFoundError("Price list");
      await tx.priceList.delete({ where: { id } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "price_list.deleted",
          resourceType: "price_list",
          resourceId: id,
          before: { name: current.name },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "price_list.deleted", { priceListId: id }, tx);
    });
  }

  // ---- prices -----------------------------------------------------------------------------------

  async listPrices(
    ctx: TenantContext,
    id: string,
    query: CursorPaginationQuery & { q?: string | undefined },
  ): Promise<Paginated<PriceListPriceEntry>> {
    const list = await this.require(ctx, id);
    const rows = await this.prisma.priceListPrice.findMany({
      where: {
        priceListId: id,
        variant: {
          deletedAt: null,
          ...(query.q
            ? {
                OR: [
                  { title: { contains: query.q, mode: "insensitive" } },
                  { sku: { contains: query.q, mode: "insensitive" } },
                  { product: { title: { contains: query.q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
      },
      include: { variant: { include: { product: { select: { id: true, title: true } } } } },
      orderBy: [
        { variant: { product: { title: "asc" } } },
        { variant: { position: "asc" } },
        { id: "asc" },
      ],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map((r) => ({
        variantId: r.variantId,
        productId: r.variant.product.id,
        productTitle: r.variant.product.title,
        variantTitle: r.variant.title,
        sku: r.variant.sku,
        basePrice: toMoney(r.variant.price, list.currency),
        price: toMoney(r.price, list.currency),
        compareAtPrice: toMoneyOrNull(r.compareAtPrice, list.currency),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pageInfo: { hasNextPage, endCursor: hasNextPage ? (page.at(-1)?.id ?? null) : null },
    };
  }

  async setPrices(
    ctx: TenantContext,
    id: string,
    input: SetPriceListPricesInput,
    meta: RequestMeta,
  ) {
    const count = await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const variantIds = [...new Set(input.prices.map((p) => p.variantId))];
      const found = await tx.productVariant.findMany({
        where: { storeId: ctx.storeId as string, deletedAt: null, id: { in: variantIds } },
        select: { id: true },
      });
      if (found.length !== variantIds.length) {
        throw new ValidationError("One or more variants are not in this store.", [
          { path: "prices", message: "Unknown variant" },
        ]);
      }
      for (const price of input.prices) {
        await tx.priceListPrice.upsert({
          where: { priceListId_variantId: { priceListId: id, variantId: price.variantId } },
          create: {
            priceListId: id,
            storeId: ctx.storeId as string,
            variantId: price.variantId,
            price: BigInt(price.price),
            compareAtPrice:
              price.compareAtPrice === null || price.compareAtPrice === undefined
                ? null
                : BigInt(price.compareAtPrice),
          },
          update: {
            price: BigInt(price.price),
            compareAtPrice:
              price.compareAtPrice === null || price.compareAtPrice === undefined
                ? null
                : BigInt(price.compareAtPrice),
          },
        });
      }
      await tx.priceList.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "price_list.prices.set",
          resourceType: "price_list",
          resourceId: id,
          metadata: { count: input.prices.length },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "price_list.updated", { priceListId: id }, tx);
      return input.prices.length;
    });
    return { updated: count };
  }

  async removePrices(ctx: TenantContext, id: string, variantIds: string[], meta: RequestMeta) {
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const result = await tx.priceListPrice.deleteMany({
        where: { priceListId: id, variantId: { in: variantIds } },
      });
      await tx.priceList.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "price_list.prices.removed",
          resourceType: "price_list",
          resourceId: id,
          metadata: { count: result.count },
          meta,
        },
        tx,
      );
      await this.events.publish(ctx, "price_list.updated", { priceListId: id }, tx);
      return result.count;
    });
    return { removed };
  }

  // ---- assignments ------------------------------------------------------------------------------

  async addAssignment(
    ctx: TenantContext,
    id: string,
    input: AssignmentTargetInput,
    meta: RequestMeta,
  ): Promise<AssignmentSummary> {
    const row = await this.prisma
      .$transaction(async (tx) => {
        await this.require(ctx, id, tx);
        const target = await this.targets.resolve(ctx, input, tx);
        const created = await tx.priceListAssignment.create({
          data: { priceListId: id, storeId: ctx.storeId as string, ...target },
          include: assignmentInclude,
        });
        await this.audit.record(
          {
            organizationId: ctx.organizationId,
            storeId: ctx.storeId,
            actorId: ctx.actor.id,
            action: "price_list.assigned",
            resourceType: "price_list",
            resourceId: id,
            after: target,
            meta,
          },
          tx,
        );
        await this.events.publish(ctx, "price_list.assigned", { priceListId: id, ...target }, tx);
        return created;
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictError("This price list is already assigned to that target.");
        }
        throw error;
      });
    return toAssignmentSummary(row);
  }

  async removeAssignment(ctx: TenantContext, id: string, assignmentId: string, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.require(ctx, id, tx);
      const current = await tx.priceListAssignment.findFirst({
        where: { id: assignmentId, priceListId: id, storeId: ctx.storeId as string },
      });
      if (!current) throw new NotFoundError("Assignment");
      await tx.priceListAssignment.delete({ where: { id: assignmentId } });
      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          storeId: ctx.storeId,
          actorId: ctx.actor.id,
          action: "price_list.unassigned",
          resourceType: "price_list",
          resourceId: id,
          before: { companyId: current.companyId, companyLocationId: current.companyLocationId },
          meta,
        },
        tx,
      );
      await this.events.publish(
        ctx,
        "price_list.unassigned",
        {
          priceListId: id,
          companyId: current.companyId,
          companyLocationId: current.companyLocationId,
        },
        tx,
      );
    });
  }

  // ---- internals --------------------------------------------------------------------------------

  async require(ctx: TenantContext, id: string, tx: Prisma.TransactionClient = this.prisma) {
    const row = await tx.priceList.findFirst({
      where: { ...this.scope(ctx), id },
      select: { id: true, name: true, currency: true },
    });
    if (!row) throw new NotFoundError("Price list");
    return row;
  }

  // Until Markets (Phase 8) every price is expressed in the store currency.
  private assertCurrency(currency: string | undefined, storeCurrency: string) {
    if (currency && currency !== storeCurrency) {
      throw new ValidationError(
        `Price lists use the store currency (${storeCurrency}) until markets are configured.`,
        [{ path: "currency", message: `Must be ${storeCurrency}` }],
      );
    }
  }

  private rethrowUnique(error: unknown): never {
    if (isUniqueViolation(error)) {
      throw new ConflictError("A price list with this name already exists.", [
        { path: "name", message: "Already taken" },
      ]);
    }
    throw error;
  }
}
