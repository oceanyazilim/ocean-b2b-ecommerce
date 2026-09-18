import { Injectable } from "@nestjs/common";
import type { Prisma } from "@ocean/db";
import type { CreateDiscountInput, DiscountCodeValidation, DiscountSummary, UpdateDiscountInput } from "@ocean/types";

import { ConflictError, NotFoundError } from "../../common/errors/domain-error";
import type { RequestMeta } from "../../common/http/request-meta";
import type { TenantContext } from "../../common/tenant/tenant-context";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { toMoney } from "../catalog/money";
import { EventsService } from "../events/events.service";

const include = { codes: true } satisfies Prisma.DiscountInclude;
type DiscountRow = Prisma.DiscountGetPayload<{ include: typeof include }>;

// Discount CRUD plus a pure calculation helper (computeAmount / resolveCode). Not yet wired
// into LineQuoterService's totals — that touches the pricing precedence chain (contract >
// price list > volume > base) and deserves its own careful pass rather than a bolt-on here.
@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope(ctx: TenantContext): Prisma.DiscountWhereInput {
    return { storeId: ctx.storeId as string, organizationId: ctx.organizationId };
  }

  private toSummary(row: DiscountRow): DiscountSummary {
    const now = new Date();
    const status = row.startsAt > now ? "scheduled" : row.endsAt && row.endsAt < now ? "expired" : "active";
    return {
      id: row.id,
      type: row.type,
      method: row.method,
      value: row.value as DiscountSummary["value"],
      conditions: (row.conditions as DiscountSummary["conditions"]) ?? {},
      codes: row.codes.map((c) => c.code),
      status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      usageLimit: row.usageLimit,
      usageCount: row.usageCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(ctx: TenantContext): Promise<DiscountSummary[]> {
    const rows = await this.prisma.discount.findMany({
      where: this.scope(ctx),
      include,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async get(ctx: TenantContext, id: string): Promise<DiscountSummary> {
    const row = await this.prisma.discount.findFirst({ where: { ...this.scope(ctx), id }, include });
    if (!row) throw new NotFoundError("Discount");
    return this.toSummary(row);
  }

  async create(
    ctx: TenantContext,
    input: CreateDiscountInput,
    meta: RequestMeta,
  ): Promise<DiscountSummary> {
    const storeId = ctx.storeId as string;
    const created = await this.prisma.discount
      .create({
        data: {
          storeId,
          organizationId: ctx.organizationId,
          type: input.type,
          method: input.method,
          value: input.value as Prisma.InputJsonValue,
          conditions: input.conditions as Prisma.InputJsonValue,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          usageLimit: input.usageLimit ?? null,
          ...(input.code ? { codes: { create: { storeId, code: input.code } } } : {}),
        },
        include,
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw new ConflictError("That discount code is already in use.");
        throw error;
      });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId,
      actorId: ctx.actor.id,
      action: "discount.created",
      resourceType: "discount",
      resourceId: created.id,
      after: { type: created.type, method: created.method },
      meta,
    });
    await this.events.publish(ctx, "discount.created", { discountId: created.id });
    return this.toSummary(created);
  }

  async update(
    ctx: TenantContext,
    id: string,
    input: UpdateDiscountInput,
    meta: RequestMeta,
  ): Promise<DiscountSummary> {
    const current = await this.prisma.discount.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Discount");
    const updated = await this.prisma.discount.update({
      where: { id },
      data: {
        ...(input.value !== undefined ? { value: input.value as Prisma.InputJsonValue } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions as Prisma.InputJsonValue } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      },
      include,
    });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "discount.updated",
      resourceType: "discount",
      resourceId: id,
      meta,
    });
    return this.toSummary(updated);
  }

  async remove(ctx: TenantContext, id: string, meta: RequestMeta): Promise<void> {
    const current = await this.prisma.discount.findFirst({ where: { ...this.scope(ctx), id } });
    if (!current) throw new NotFoundError("Discount");
    await this.prisma.discount.delete({ where: { id } });
    await this.audit.record({
      organizationId: ctx.organizationId,
      storeId: ctx.storeId,
      actorId: ctx.actor.id,
      action: "discount.deleted",
      resourceType: "discount",
      resourceId: id,
      meta,
    });
  }

  // Pure: how much this discount takes off a given subtotal. Callers apply it, this never
  // mutates usageCount — that only happens once an order actually uses the code.
  computeAmount(discount: Pick<DiscountRow, "type" | "value">, subtotal: number): number {
    const value = discount.value as { amount?: number; percent?: number };
    if (discount.type === "percentage") return Math.round((subtotal * (value.percent ?? 0)) / 100);
    if (discount.type === "fixed_amount") return Math.min(subtotal, value.amount ?? 0);
    return 0; // free_shipping affects shippingTotal, not the merchandise subtotal
  }

  // Validates a buyer-entered code against subtotal/date/usage — the check a checkout would
  // call before applying it. Returns null (never throws) so "invalid code" stays a normal case.
  async resolveCode(
    ctx: TenantContext,
    code: string,
    subtotal: number,
  ): Promise<DiscountCodeValidation | null> {
    const row = await this.prisma.discount.findFirst({
      where: { ...this.scope(ctx), method: "code", codes: { some: { code: code.trim().toUpperCase() } } },
      include,
    });
    if (!row) return null;
    const now = new Date();
    if (row.startsAt > now) return null;
    if (row.endsAt && row.endsAt < now) return null;
    if (row.usageLimit !== null && row.usageCount >= row.usageLimit) return null;
    const conditions = row.conditions as { minSubtotal?: number };
    if (conditions.minSubtotal !== undefined && subtotal < conditions.minSubtotal) return null;
    const store = await this.prisma.store.findUnique({
      where: { id: ctx.storeId as string },
      select: { defaultCurrency: true },
    });
    const currency = store?.defaultCurrency ?? "TRY";
    return { discount: this.toSummary(row), amount: toMoney(this.computeAmount(row, subtotal), currency) };
  }
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
